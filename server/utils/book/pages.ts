import { contentTypeList, imageTypeList } from "@common/utils/ext";

/**
 * 页名固定 7 位：`0000001.jpg`。
 * 与「总页数」解耦，换书、换排序后进度 / 书签的 key 仍然稳定；9,999,999 页是硬上限。
 */
export const BOOK_PAGE_DIGITS = 7;
export const BOOK_PAGE_LIMIT = 10 ** BOOK_PAGE_DIGITS - 1;

/** 目前允许当页图的扩展名：都能在 contentTypeList 里查到 image/* */
const PAGE_EXT_LIST = ["jpg", "png", "gif", "webp"];

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
 * 注：BMP 暂不支持（contentTypeList 里没有 image/bmp），等阶段 3 需要时再一起加。
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
    return undefined;
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
