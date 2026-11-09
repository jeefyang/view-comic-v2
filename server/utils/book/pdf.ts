import fsp from "fs/promises";
import { createRequire } from "module";
import path from "path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { withRenderSlot } from "../renderQueue";
import { pageCacheKey, readPageCache, writePageCache } from "./cache";
import { BookError } from "./errors";
import { BOOK_PAGE_LIMIT, buildBookPageList } from "./pages";

/** 页图目标宽度（像素）；缩略图按 min(width * 2, 2000) 请求 */
export const PDF_TARGET_WIDTH = 2000;
/** 高封顶：海报式超长页按比例再缩，否则单页解码就能顶穿内存 */
const PDF_MAX_HEIGHT = 8000;
/** JPEG 质量：比缩略图的 72 高一点，正文小字才不至于糊 */
const PDF_JPEG_QUALITY = 80;

const DEFAULT_MAX_MB = 250;

function maxPdfMb() {
    const value = Number(process.env.BOOK_PDF_MAX_MB);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_MB;
}

const require = createRequire(import.meta.url);

let assetDir: string | undefined;

/** pdfjs 的 standard_fonts / cmaps 都在包目录里；取不到就让 pdfjs 用自己的兜底 */
function pdfAssetDir(sub: string) {
    if (assetDir === undefined) {
        try {
            assetDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
        }
        catch {
            assetDir = "";
        }
    }
    return assetDir ? path.join(assetDir, sub) + path.sep : undefined;
}

type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

type DocEntry = { doc: PdfDoc; mtimeMs: number };

/**
 * 打开过的文档常驻内存：同一本书翻页时不必每页重新解析 xref / 字体。
 * 上限 2（spec §5），换书即淘汰最久未用的那本；文件被替换（mtime 变了）也直接换新的。
 */
const DOC_LRU = 2;
const docCache = new Map<string, DocEntry>();

function dropDoc(key: string, entry: DocEntry) {
    docCache.delete(key);
    entry.doc.destroy().catch(() => {
        // 文档已经销毁 / 正在销毁，忽略即可
    });
}

function mapOpenError(e: unknown): BookError {
    const name = (e as { name?: string } | undefined)?.name;
    if (name === "PasswordException") {
        return new BookError(415, "该文件有 DRM 或密码保护，暂不支持；请用已授权的阅读器导出后再放入书库。");
    }
    if (name === "InvalidPDFException" || name === "FormatError") {
        return new BookError(400, "文件无法解析，可能已损坏。");
    }
    console.error("打开 PDF 失败:", e);
    return new BookError(400, "文件无法解析，可能已损坏。");
}

async function openDoc(absPath: string, mtimeMs: number): Promise<PdfDoc> {
    const cached = docCache.get(absPath);
    if (cached && cached.mtimeMs === mtimeMs) {
        // 命中即提到队尾，Map 的插入顺序就是 LRU 顺序
        docCache.delete(absPath);
        docCache.set(absPath, cached);
        return cached.doc;
    }
    if (cached) {
        dropDoc(absPath, cached);
    }
    const stat = await fsp.stat(absPath);
    const maxBytes = maxPdfMb() * 1024 * 1024;
    if (stat.size > maxBytes) {
        throw new BookError(413, `PDF 超过 ${maxPdfMb()}MB，暂不支持在线阅读；请拆分或压缩后再试。`);
    }
    const data = await fsp.readFile(absPath);
    let doc: PdfDoc;
    try {
        doc = await pdfjs.getDocument({
            data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            // 书库里都是自己的文件，不需要 eval 提速；关掉更稳
            isEvalSupported: false,
            useSystemFonts: false,
            standardFontDataUrl: pdfAssetDir("standard_fonts"),
            // 中日韩 PDF 常用 CID 字体 + GBK-EUC-H 之类的 CMap，缺了这些表整页文字都会丢
            cMapUrl: pdfAssetDir("cmaps"),
            cMapPacked: true
        }).promise;
    }
    catch (e) {
        throw mapOpenError(e);
    }
    docCache.set(absPath, { doc, mtimeMs });
    while (docCache.size > DOC_LRU) {
        const oldestKey = docCache.keys().next().value as string | undefined;
        if (!oldestKey) {
            break;
        }
        const oldest = docCache.get(oldestKey);
        if (!oldest) {
            break;
        }
        dropDoc(oldestKey, oldest);
    }
    return doc;
}

/** 页列表：只读文档的页数，不渲染任何东西（书架/阅读页列表要快） */
export async function getPdfPageList(absPath: string, f: ViewFileType): Promise<ComicFileType[]> {
    const stat = await fsp.stat(absPath);
    const doc = await openDoc(absPath, stat.mtimeMs);
    if (doc.numPages < 1) {
        throw new BookError(400, "文件里没有可显示的页面。");
    }
    if (doc.numPages > BOOK_PAGE_LIMIT) {
        throw new BookError(400, "页数超过上限，暂不支持。");
    }
    // 渲染出来统一是 JPEG，页名就统一 .jpg；宽度高度不进列表，前端靠 decodeSize 自己量
    return buildBookPageList(f, new Array(doc.numPages).fill("jpg"));
}

async function renderPage(doc: PdfDoc, index: number, width: number): Promise<Buffer> {
    const page = await doc.getPage(index + 1);
    try {
        const base = page.getViewport({ scale: 1 });
        let scale = width / base.width;
        if (base.height * scale > PDF_MAX_HEIGHT) {
            scale = PDF_MAX_HEIGHT / base.height;
        }
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        const context = canvas.getContext("2d");
        // pdfjs 的类型来自 DOM lib，而这边是 @napi-rs/canvas 的实现，运行时兼容、类型对不上
        await page.render({ canvasContext: context, viewport } as unknown as Parameters<typeof page.render>[0]).promise;
        const buffer = canvas.toBuffer("image/jpeg", PDF_JPEG_QUALITY);
        if (!buffer.length) {
            throw new Error("渲染结果为空");
        }
        return buffer;
    }
    finally {
        page.cleanup();
    }
}

/** 同一页的并发生成合并成一个 Promise：<img> 重试 / 双端同时打开时只渲染一次 */
const rendering = new Map<string, Promise<Buffer>>();

export async function getPdfPageBuffer(opts: {
    libName: string;
    absPath: string;
    relPath: string;
    index: number;
    width?: number;
    /** 调用方已经占了渲染槽位时传 false，避免嵌套槽位互等 */
    slot?: boolean;
}): Promise<{ buffer: Buffer; ext: string } | undefined> {
    const stat = await fsp.stat(opts.absPath);
    const doc = await openDoc(opts.absPath, stat.mtimeMs);
    if (!Number.isInteger(opts.index) || opts.index < 0 || opts.index >= doc.numPages) {
        return undefined;
    }
    const width = opts.width && opts.width > 0
        ? Math.min(Math.round(opts.width), PDF_TARGET_WIDTH)
        : PDF_TARGET_WIDTH;
    const key = pageCacheKey(opts.libName, opts.relPath, stat.mtimeMs, stat.size, opts.index, width);
    const cached = await readPageCache(key);
    if (cached) {
        return { buffer: cached, ext: "jpg" };
    }
    const running = rendering.get(key);
    if (running) {
        return { buffer: await running, ext: "jpg" };
    }
    const task = (async () => {
        try {
            const buffer = await renderPage(doc, opts.index, width);
            await writePageCache(key, buffer);
            return buffer;
        }
        catch (e) {
            if (e instanceof BookError) {
                throw e;
            }
            console.error(`渲染 PDF 第 ${opts.index + 1} 页失败:`, opts.absPath, e);
            throw new Error("页面渲染失败，请稍后重试。");
        }
    })();
    const guarded = opts.slot === false ? task : withRenderSlot(() => task);
    rendering.set(key, guarded);
    try {
        return { buffer: await guarded, ext: "jpg" };
    }
    finally {
        rendering.delete(key);
    }
}
