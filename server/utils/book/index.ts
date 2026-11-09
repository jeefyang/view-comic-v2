import fsp from "fs/promises";
import { getFileExt } from "../index";
import { BookError } from "./errors";
import { isBookExtType } from "./pages";
import { getPdfPageBuffer, getPdfPageList } from "./pdf";

export type BookKind = "pdf" | "epub" | "mobi";

export function bookKindOf(extType?: ViewFileExtType): BookKind | undefined {
    return isBookExtType(extType) ? extType as BookKind : undefined;
}

/** 阶段 1 只接了 PDF；EPUB / MOBI 留到阶段 2 / 3，点开时给出明确提示而不是静默 404 */
function notYet(kind: BookKind) {
    return new BookError(415, kind === "epub"
        ? "EPUB 支持还在开发中（阶段 2），暂不可用；可先压成 zip 或按图片目录阅读。"
        : "MOBI 支持还在开发中（阶段 3），暂不可用；可先压成 zip 或按图片目录阅读。");
}

/** 容器书 → 页列表，形状与 getMyStreamZip 那条链路完全一致（list + baseFile + basePath + start） */
export async function getBookViewList(p: string, f: ViewFileType, basePath: string): Promise<ComicFileListType> {
    const kind = bookKindOf(f.extType);
    if (!kind) {
        throw new BookError(400, "不是支持的电子书格式。");
    }
    if (kind !== "pdf") {
        throw notYet(kind);
    }
    const list = await getPdfPageList(p, f);
    return {
        list,
        baseFile: f,
        basePath,
        start: 0
    };
}

/** 取某一页的图；index 越界返回 undefined（路由层照旧 404） */
export async function getBookPageBuffer(opts: {
    kind: BookKind;
    libName: string;
    absPath: string;
    relPath: string;
    index: number;
    width?: number;
    slot?: boolean;
}): Promise<{ buffer: Buffer; ext: string } | undefined> {
    if (opts.kind !== "pdf") {
        throw notYet(opts.kind);
    }
    return await getPdfPageBuffer(opts);
}

/**
 * 书架封面 / 页列表缩略图：给了页名就出那一页，只给容器就取第 1 页。
 *
 * 这里**不占**渲染槽位（slot: false）：调用它的 thumb.ts 已经站在槽位里了，
 * 再抢一次会让两个任务互等。
 */
export async function getBookThumbBuffer(opts: {
    libName: string;
    absPath: string;
    relPath: string;
    pageIndex: number;
    width: number;
}): Promise<Buffer | undefined> {
    const kind = bookKindOf(getFileExt(opts.absPath).extType);
    if (!kind) {
        return undefined;
    }
    if (kind !== "pdf") {
        // 阶段 2 / 3 之前，EPUB / MOBI 就是「暂时没有缩略图」，不要让它变成整屏报错
        return undefined;
    }
    // 缩略图要小，但 pdfjs 的渲染质量随尺寸下降；按 2 倍宽渲染再由 sharp 缩，字才不糊
    const renderWidth = Math.min(2000, Math.max(240, Math.round(opts.width) * 2));
    const page = await getPdfPageBuffer({
        libName: opts.libName,
        absPath: opts.absPath,
        relPath: opts.relPath,
        index: opts.pageIndex,
        width: renderWidth,
        slot: false
    });
    return page?.buffer;
}
