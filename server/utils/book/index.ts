import { getFileExt } from "../index";
import { BookError } from "./errors";
import { getEpubPageBuffer, getEpubPageList } from "./epub";
import { isBookExtType } from "./pages";
import { getMobiPageBuffer, getMobiPageList } from "./mobi";
import { getPdfPageBuffer, getPdfPageList } from "./pdf";

export type BookKind = "pdf" | "epub" | "mobi";

export function bookKindOf(extType?: ViewFileExtType): BookKind | undefined {
    return isBookExtType(extType) ? extType as BookKind : undefined;
}

/** 容器书 → 页列表，形状与 getMyStreamZip 那条链路完全一致（list + baseFile + basePath + start） */
export async function getBookViewList(p: string, f: ViewFileType, basePath: string): Promise<ComicFileListType> {
    const kind = bookKindOf(f.extType);
    if (!kind) {
        throw new BookError(400, "不是支持的电子书格式。");
    }
    const list = await (kind === "pdf"
        ? getPdfPageList(p, f)
        : kind === "epub"
            ? getEpubPageList(p, f)
            : getMobiPageList(p, f));
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
    if (opts.kind === "pdf") {
        return await getPdfPageBuffer(opts);
    }
    if (opts.kind === "epub") {
        // EPUB 页图是包内原图，不渲染、不缩放，width / slot 都用不上
        return await getEpubPageBuffer({
            absPath: opts.absPath,
            relPath: opts.relPath,
            index: opts.index
        });
    }
    // MOBI 页图同样是 record 里的原图，不渲染、不占槽
    return await getMobiPageBuffer({
        absPath: opts.absPath,
        index: opts.index
    });
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
    if (kind === "epub") {
        // 直接拿第 1 页原图交给 sharp 缩，省掉一次渲染
        const page = await getEpubPageBuffer({
            absPath: opts.absPath,
            relPath: opts.relPath,
            index: opts.pageIndex
        });
        return page?.buffer;
    }
    if (kind === "mobi") {
        // 取第 1 页原图交给 sharp；打不开（azw3 / 文字版 / DRM）就当没缩略图，书架显示占位
        try {
            const page = await getMobiPageBuffer({
                absPath: opts.absPath,
                index: opts.pageIndex
            });
            return page?.buffer;
        }
        catch {
            return undefined;
        }
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
