import fsp from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { BookError } from "./errors";
import { BOOK_PAGE_LIMIT, buildBookPageList, sniffImageExt } from "./pages";

/**
 * MOBI（PalmDB）只做「固定版式 / 图片型」：
 * 页 = 图片 record，按 offset 表升序；正文 record 不解压、不排版。
 *
 * 只读需要的区段，不整份 readFile：78 字节头 → record offset 表 → record0
 * （PalmDOC / MOBI / EXTH）→ 每条候选 record 的前 16 字节判图片 → 取某页时才读整条。
 */

const BROKEN_MESSAGE = "文件无法解析，可能已损坏。";
const DRM_MESSAGE = "该文件有 DRM 保护，暂不支持；请用已授权的阅读器导出后再放入书库。";
const TEXT_MESSAGE = "这是文字版 MOBI，按页阅读需要图片型文件；可用 ebook-convert 转成 EPUB 后重试。";
const AZW3_MESSAGE = "azw3 暂不支持，请转为 EPUB 后重试。";
const EMPTY_MESSAGE = "文件里没有可显示的页面。";

const PDB_HEADER_LEN = 78;
const RECORD_INFO_LEN = 8;
const MOBI_HEADER_OFFSET = 16;
/** MOBI header 里第一个图片 record 号（相对 MOBI header 起点） */
const FIRST_IMAGE_FIELD = 0x6c;
const NO_INDEX = 0xffffffff;
/** 固定版式兜底判定：正文总量不到图片总量的 5%，且至少 2 张图（覆盖 calibre / KCC 产物） */
const FIXED_LAYOUT_TEXT_RATIO = 0.05;

type MobiImage = {
    offset: number;
    length: number;
    ext: string;
};

type MobiMeta = {
    images: MobiImage[];
};

function broken(): BookError {
    return new BookError(400, BROKEN_MESSAGE);
}

function drm(): BookError {
    return new BookError(415, DRM_MESSAGE);
}

function textOnly(): BookError {
    return new BookError(415, TEXT_MESSAGE);
}

async function readExactly(fh: FileHandle, length: number, position: number): Promise<Buffer> {
    const buffer = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
        const { bytesRead } = await fh.read(buffer, done, length - done, position + done);
        if (bytesRead <= 0) {
            throw broken();
        }
        done += bytesRead;
    }
    return buffer;
}

/** 解析 record offset 表；表里没有「末尾」，最后一条以文件长度为界 */
async function readRecordStarts(fh: FileHandle): Promise<number[]> {
    const stat = await fh.stat();
    if (stat.size < PDB_HEADER_LEN + RECORD_INFO_LEN) {
        throw broken();
    }
    const head = await readExactly(fh, PDB_HEADER_LEN, 0);
    const numRecords = head.readUInt16BE(76);
    if (numRecords < 1) {
        throw broken();
    }
    const tableLen = numRecords * RECORD_INFO_LEN;
    if (PDB_HEADER_LEN + tableLen > stat.size) {
        throw broken();
    }
    const table = await readExactly(fh, tableLen, PDB_HEADER_LEN);
    const starts: number[] = [];
    for (let i = 0; i < numRecords; i++) {
        starts.push(table.readUInt32BE(i * RECORD_INFO_LEN));
    }
    starts.push(stat.size);
    // 偏移必须单调、落在文件内，且 record0 不能压在头/表里
    if (starts[0]! < PDB_HEADER_LEN + tableLen) {
        throw broken();
    }
    for (let i = 0; i < numRecords; i++) {
        const next = starts[i + 1]!;
        if (next <= starts[i]! || next > stat.size) {
            throw broken();
        }
    }
    return starts;
}

async function parseMobi(fh: FileHandle): Promise<MobiMeta> {
    const starts = await readRecordStarts(fh);
    const numRecords = starts.length - 1;
    const record0Len = starts[1]! - starts[0]!;
    if (record0Len < MOBI_HEADER_OFFSET + 0x18) {
        throw broken();
    }
    const record0 = await readExactly(fh, record0Len, starts[0]!);

    const compression = record0.readUInt16BE(0);
    const textRecordCount = record0.readUInt16BE(8);
    const encryptionType = record0.readUInt16BE(12);

    if (record0.toString("latin1", MOBI_HEADER_OFFSET, MOBI_HEADER_OFFSET + 4) !== "MOBI") {
        // TEXtREAd（比 MOBI 更老、纯文本）与损坏文件都不做
        throw broken();
    }
    const headerLen = record0.readUInt32BE(20);
    if (headerLen < 0x18 || MOBI_HEADER_OFFSET + headerLen > record0.length) {
        throw broken();
    }
    const version = record0.readUInt32BE(36); // MOBI header + 0x14
    if (version >= 8) {
        // KF8 / azw3：双格式 .mobi 的 MOBI7 段版本是 6，这里只兜住「只有 KF8」的文件
        throw new BookError(415, AZW3_MESSAGE);
    }

    if (encryptionType !== 0) {
        throw drm();
    }
    if (headerLen >= 0xa8 + 4) {
        const drmOffset = record0.readUInt32BE(MOBI_HEADER_OFFSET + 0xa8);
        const drmCount = record0.readUInt32BE(MOBI_HEADER_OFFSET + 0xac);
        if (drmOffset !== NO_INDEX || drmCount !== NO_INDEX) {
            throw drm();
        }
    }

    const firstImage = headerLen >= FIRST_IMAGE_FIELD + 4
        ? record0.readUInt32BE(MOBI_HEADER_OFFSET + FIRST_IMAGE_FIELD)
        : NO_INDEX;

    // EXTH：121 KF8 边界、122 fixed-layout、123 book-type
    let kf8Boundary: number | undefined;
    let markedFixedLayout = false;
    let bookType = "";
    const exthStart = MOBI_HEADER_OFFSET + headerLen;
    if (exthStart + 12 <= record0.length && record0.toString("latin1", exthStart, exthStart + 4) === "EXTH") {
        const exthLen = record0.readUInt32BE(exthStart + 4);
        const count = record0.readUInt32BE(exthStart + 8);
        const exthEnd = Math.min(record0.length, exthStart + Math.max(exthLen, 12));
        let cursor = exthStart + 12;
        for (let i = 0; i < count && cursor + 8 <= exthEnd; i++) {
            const type = record0.readUInt32BE(cursor);
            const len = record0.readUInt32BE(cursor + 4);
            if (len < 8 || cursor + len > exthEnd) {
                break;
            }
            const value = record0.subarray(cursor + 8, cursor + len);
            if (type === 121 && value.length >= 4) {
                kf8Boundary = value.readUInt32BE(0);
            }
            else if (type === 122 && value.length >= 4) {
                markedFixedLayout = value.readUInt32BE(0) === 1;
            }
            else if (type === 123) {
                bookType = value.toString("utf8").trim().toLowerCase();
            }
            cursor += len;
        }
    }

    // 双格式：只看 MOBI7 段，KF8 段（含里面的图片）整段忽略
    const limit = kf8Boundary !== undefined && kf8Boundary > 1 && kf8Boundary <= numRecords
        ? kf8Boundary
        : numRecords;

    // firstImageIndex 缺失（老 BAEN / 部分工具）时，图片就从正文 record 之后开始
    const textEnd = Math.min(textRecordCount + 1, numRecords);
    const scanStart = firstImage !== NO_INDEX && firstImage > 0 && firstImage < limit
        ? firstImage
        : Math.max(1, textEnd);

    const images: MobiImage[] = [];
    for (let i = scanStart; i < limit; i++) {
        const offset = starts[i]!;
        const length = starts[i + 1]! - offset;
        // 4 字节的 e98e0d0a 结束标记、FLIS/FCIS/SRCS 等都不是图片，靠 magic 判定
        if (length < 16) {
            continue;
        }
        const probe = await readExactly(fh, 16, offset);
        const ext = sniffImageExt(probe);
        if (ext) {
            images.push({ offset, length, ext });
        }
    }

    // 固定版式判定：先看显式标记，再看「正文相对图片几乎可以忽略」的兜底
    const markedFixed = markedFixedLayout || bookType === "comic" || bookType === "magazine";
    let textBytes = 0;
    for (let i = 1; i <= textRecordCount && i + 1 < starts.length; i++) {
        textBytes += starts[i + 1]! - starts[i]!;
    }
    let imageBytes = 0;
    for (const image of images) {
        imageBytes += image.length;
    }
    const looksFixed = images.length >= 2 && imageBytes > 0 && textBytes < imageBytes * FIXED_LAYOUT_TEXT_RATIO;
    if (!markedFixed && !looksFixed) {
        throw textOnly();
    }
    if (images.length > BOOK_PAGE_LIMIT) {
        throw new BookError(400, "页数超过上限，暂不支持。");
    }
    // 显式标了固定版式但一张图都没有：按「空书」返回空列表（§2.7）
    if (images.length === 0 && !markedFixed) {
        throw new BookError(400, EMPTY_MESSAGE);
    }
    // compression 只影响正文排版，取图片不需要解压；留个可读引用避免「读了没用」
    void compression;
    return { images };
}

async function withMobi<T>(absPath: string, task: (fh: FileHandle) => Promise<T>): Promise<T> {
    if (path.extname(absPath).toLowerCase() === ".azw3") {
        throw new BookError(415, AZW3_MESSAGE);
    }
    let fh: FileHandle | undefined;
    try {
        fh = await fsp.open(absPath, "r");
        return await task(fh);
    }
    catch (e) {
        if (e instanceof BookError) {
            throw e;
        }
        console.error("解析 MOBI 失败:", absPath, e);
        throw broken();
    }
    finally {
        if (fh) {
            await fh.close().catch(() => undefined);
        }
    }
}

/** 容器书 → 页列表；页序 = 图片 record 升序 */
export async function getMobiPageList(absPath: string, f: ViewFileType): Promise<ComicFileType[]> {
    const meta = await withMobi(absPath, parseMobi);
    return buildBookPageList(f, meta.images.map((image) => image.ext));
}

/** 取某一页原图字节；越界返回 undefined（路由层 404） */
export async function getMobiPageBuffer(opts: {
    absPath: string;
    index: number;
}): Promise<{ buffer: Buffer; ext: string } | undefined> {
    const { absPath, index } = opts;
    if (!Number.isInteger(index) || index < 0) {
        return undefined;
    }
    return await withMobi(absPath, async (fh) => {
        const meta = await parseMobi(fh);
        const image = meta.images[index];
        if (!image) {
            return undefined;
        }
        const buffer = await readExactly(fh, image.length, image.offset);
        // 条目名不可信，落 Content-Type 前再用真字节确认一次
        return { buffer, ext: sniffImageExt(buffer) ?? image.ext };
    });
}
