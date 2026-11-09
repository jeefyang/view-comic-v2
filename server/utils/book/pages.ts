import { contentTypeList, imageTypeList } from "@common/utils/ext";

/**
 * 页名固定 7 位：`0000001.jpg`。
 * 与「总页数」解耦，换书、换排序后进度 / 书签的 key 仍然稳定；9,999,999 页是硬上限。
 */
export const BOOK_PAGE_DIGITS = 7;
export const BOOK_PAGE_LIMIT = 10 ** BOOK_PAGE_DIGITS - 1;

/** 目前允许当页图的扩展名：都能在 contentTypeList 里查到 image/* */
export const PAGE_EXT_LIST = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

const BOOK_EXT_TYPES: ViewFileExtType[] = ["pdf", "epub", "mobi"];

/** 这个 extType 是不是「容器书」（页要从文件内部取出来） */
export function isBookExtType(extType?: ViewFileExtType) {
    return !!extType && BOOK_EXT_TYPES.includes(extType);
}

/** 0 起的页码 → 页名 */
export function formatPageName(index: number, ext: string) {
    if (!Number.isInteger(index) || index < 0 || index > BOOK_PAGE_LIMIT) {
        throw new RangeError(`页序号超出范围：${index}`);
    }
    return `${String(index + 1).padStart(BOOK_PAGE_DIGITS, "0")}.${ext.toLowerCase()}`;
}

const PAGE_NAME_RE = /^(\d{7})\.([a-z0-9]+)$/i;

/** 页名 → 0 起的页码；不是合法页名返回 undefined（书架封面路径就是这种） */
export function parsePageName(name: string): number | undefined {
    const matched = PAGE_NAME_RE.exec(name);
    if (!matched) {
        return undefined;
    }
    const index = parseInt(matched[1]!, 10) - 1;
    const ext = matched[2]!.toLowerCase();
    if (index < 0 || !PAGE_EXT_LIST.includes(ext)) {
        return undefined;
    }
    return index;
}

/**
 * 按 magic bytes 判图片类型：包内条目名不可信（有些 EPUB / MOBI 里叫 image001.dat）。
 * 认不出返回 undefined，由调用方跳过该候选。
 */
export function sniffImageExt(buffer: Buffer | Uint8Array): string | undefined {
    const data = Buffer.isBuffer(buffer)
        ? buffer
        : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (data.length < 12) {
        return undefined;
    }
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        return "jpg";
    }
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
        return "png";
    }
    const head6 = data.toString("latin1", 0, 6);
    if (head6 === "GIF87a" || head6 === "GIF89a") {
        return "gif";
    }
    if (data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") {
        return "webp";
    }
    // BMP：文件头只有 "BM" 两个字节可靠，再看 bfOffBits 是否像个正常的像素偏移
    if (data[0] === 0x42 && data[1] === 0x4d) {
        const offBits = data.readUInt32LE(10);
        if (offBits >= 14 && offBits < 1 << 20) {
            return "bmp";
        }
    }
    return undefined;
}

/** 解码后的原始像素，sharp 用 `{ raw }` 直接吃 */
export interface RawRgbaImage {
    data: Buffer;
    width: number;
    height: number;
}

/**
 * 把未压缩的 BMP 解成 RGBA 原始像素。
 * sharp 不认 BMP，而漫画 MOBI / EPUB 里偶尔会有 24/32 位未压缩 BMP 页；
 * 只支持 BI_RGB（compression=0），其余（调色板、RLE、位域）返回 undefined，按「生成不了缩略图」处理。
 */
export function decodeBmpRaw(buffer: Buffer): RawRgbaImage | undefined {
    if (buffer.length < 54 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
        return undefined;
    }
    if (buffer.readUInt32LE(14) < 40) {
        // BITMAPCOREHEADER（老 OS/2 格式）没有 bpp / compression 字段
        return undefined;
    }
    const pixelOffset = buffer.readUInt32LE(10);
    const width = buffer.readInt32LE(18);
    const rawHeight = buffer.readInt32LE(22);
    const bpp = buffer.readUInt16LE(28);
    const compression = buffer.readUInt32LE(30);
    if (compression !== 0 || (bpp !== 24 && bpp !== 32)) {
        return undefined;
    }
    if (width <= 0 || rawHeight === 0 || width > 20000 || Math.abs(rawHeight) > 20000) {
        return undefined;
    }
    const topDown = rawHeight < 0;
    const height = Math.abs(rawHeight);
    const bytesPerPixel = bpp / 8;
    const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
    if (pixelOffset + rowSize * height > buffer.length) {
        return undefined;
    }
    const data = Buffer.alloc(width * height * 4);
    let hasAlpha = false;
    for (let y = 0; y < height; y++) {
        const srcRow = pixelOffset + (topDown ? y : height - 1 - y) * rowSize;
        let dst = y * width * 4;
        for (let x = 0; x < width; x++) {
            const src = srcRow + x * bytesPerPixel;
            data[dst] = buffer[src + 2]!;
            data[dst + 1] = buffer[src + 1]!;
            data[dst + 2] = buffer[src]!;
            const alpha = bpp === 32 ? buffer[src + 3]! : 0xff;
            if (alpha !== 0) {
                hasAlpha = true;
            }
            data[dst + 3] = alpha;
            dst += 4;
        }
    }
    // 32 位 BMP 的 alpha 经常整片写 0（表示「不用 alpha」），当成透明会把缩略图糊成黑块
    if (bpp === 32 && !hasAlpha) {
        for (let i = 3; i < data.length; i += 4) {
            data[i] = 0xff;
        }
    }
    return { data, width, height };
}

/** 页本身不落盘，大小 / 时间一律取容器文件的值（与 zip 包内条目的展示口径一致） */
export function buildBookPageList(f: ViewFileType, exts: string[]): ComicFileType[] {
    if (exts.length > BOOK_PAGE_LIMIT) {
        throw new RangeError(`页数超过 ${BOOK_PAGE_LIMIT}：${exts.length}`);
    }
    return exts.map((ext, index) => ({
        name: formatPageName(index, ext),
        size: f.size,
        sizeStr: f.sizeStr,
        createTime: f.createTime,
        createTimeMS: f.createTimeMS,
        updateTime: f.updateTime,
        updateTimeMS: f.updateTimeMS,
        ext,
        extType: "image" as ViewFileExtType,
        isDir: false,
        index
    }));
}

/** 页图落盘 / 判定时的 Content-Type 由这里统一给出，避免各处自己拼 */
export function pageContentType(ext: string) {
    const normalized = ext.toLowerCase();
    if (contentTypeList[normalized as keyof typeof contentTypeList]) {
        return contentTypeList[normalized as keyof typeof contentTypeList];
    }
    return "application/octet-stream";
}

/** 只用于自检脚本：把「是不是图片」这件事和 imageTypeList 对齐 */
export function isPageImageName(name: string) {
    return imageTypeList.includes(name.split(".").pop()?.toLowerCase() || "");
}
