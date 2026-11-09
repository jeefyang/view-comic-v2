import fsp from "fs/promises";
import path from "path";
import StreamZip from "node-stream-zip";
import { XMLParser } from "fast-xml-parser";
import { BookError } from "./errors";
import { BOOK_PAGE_LIMIT, buildBookPageList, sniffImageExt } from "./pages";

/**
 * EPUB 只做 pre-paginated / 图片型：spine 的每一项映射成一页，页图就是包内那张图的原始字节。
 *
 * 与 zip 那条链路对外完全同形：页名固定 7 位、index 从 0 起、页图 URL 不变；
 * 区别只在「包内条目」换成了 EPUB 的 spine，且页图不转码、不落盘、不占渲染槽位。
 * 文字版（可重排）EPUB 不做重排，整本拒绝并给一句能看懂的提示。
 */

const BROKEN_MESSAGE = "文件无法解析，可能已损坏。";
const TEXT_MESSAGE = "这是文字版（可重排）EPUB，按页阅读需要图片型或固定版式文件；可用 calibre 转换后重试。";
const DRM_MESSAGE = "该文件有 DRM 保护，暂不支持；请用已授权的阅读器导出后再放入书库。";
const EMPTY_MESSAGE = "文件里没有可显示的页面。";

/** 同时打开的包上限；与 PDF 的 DOC_LRU 保持一致 */
const HANDLE_LRU = 2;

/** 允许当页图的扩展名，只用来从条目名里认页 */
const EPUB_PAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"];

/** 字体混淆不是 DRM：EPUB 给字体做 XOR 是常规做法，不能因此拒绝整本书 */
const FONT_OBFUSCATION_ALGORITHMS = [
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#rc"
];

type Zip = StreamZip.StreamZipAsync;

/** 一页 = 容器里的一个图片条目 */
export type EpubPage = {
    entry: string;
    ext: string;
};

type EpubHandle = {
    zip: Zip;
    mtimeMs: number;
    /** 条目名（小写、正斜杠）→ 包里的真实名字；包里的名字大小写 / ./ 前缀并不可靠 */
    entryNames: Map<string, string>;
    pages: EpubPage[];
    /** 同一包上的读取串行执行：每个条目都要现开流，并发太高会放大内存峰值 */
    chain: Promise<unknown>;
};

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // href / id / media-type 一律保留原始字符串，别被转成数字
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true
});

function parseXml(text: string): unknown {
    try {
        return xmlParser.parse(text.replace(/^\uFEFF/, ""));
    }
    catch {
        // 不是合法 XML：由调用方按「解析不出来」处理（XHTML 另有一条容错扫描）
        return undefined;
    }
}

function localName(tag: string) {
    const index = tag.indexOf(":");
    return (index >= 0 ? tag.slice(index + 1) : tag).toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

/** 遍历所有子节点（不含根），回调里拿到标签名与节点本身 */
function walk(node: unknown, visit: (tag: string, value: Record<string, unknown>) => void) {
    if (Array.isArray(node)) {
        for (const item of node) {
            walk(item, visit);
        }
        return;
    }
    const record = asRecord(node);
    if (!record) {
        return;
    }
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith("@_") || key === "#text") {
            continue;
        }
        // fast-xml-parser 把同名多元素给成数组；数组元素本身也是「这个标签」，不能只递归它的子节点
        if (Array.isArray(value)) {
            for (const item of value) {
                const child = asRecord(item);
                if (child) {
                    visit(key, child);
                }
            }
            walk(value, visit);
            continue;
        }
        const child = asRecord(value);
        if (child) {
            visit(key, child);
        }
        walk(value, visit);
    }
}

/** 取属性：先按字面匹配，再按本地名匹配（xlink:href / opf:role 这类带前缀的写法） */
function attr(node: Record<string, unknown>, ...names: string[]): string | undefined {
    for (const name of names) {
        const direct = node[`@_${name}`];
        if (typeof direct === "string" && direct.trim()) {
            return direct.trim();
        }
    }
    const wanted = names.map((name) => name.toLowerCase());
    for (const [key, value] of Object.entries(node)) {
        if (!key.startsWith("@_") || typeof value !== "string" || !value.trim()) {
            continue;
        }
        if (wanted.includes(localName(key.slice(2)))) {
            return value.trim();
        }
    }
    return undefined;
}

function collectByTag(node: unknown, tagName: string): Record<string, unknown>[] {
    const found: Record<string, unknown>[] = [];
    walk(node, (tag, value) => {
        if (localName(tag) === tagName) {
            found.push(value);
        }
    });
    return found;
}

function firstTag(node: unknown, tagName: string): Record<string, unknown> | undefined {
    let found: Record<string, unknown> | undefined;
    walk(node, (tag, value) => {
        if (!found && localName(tag) === tagName) {
            found = value;
        }
    });
    return found;
}

function findRootFilePath(node: unknown): string | undefined {
    let found: string | undefined;
    walk(node, (tag, value) => {
        if (found || localName(tag) !== "rootfile") {
            return;
        }
        const fullPath = attr(value, "full-path");
        if (fullPath) {
            found = fullPath;
        }
    });
    return found;
}

function normalizeEntryName(name: string) {
    return name.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

/** 包内条目名 → 真实名字；大小写与百分号编码都可能对不上，这里统一兜一次 */
function resolveEntry(entryNames: Map<string, string>, wanted: string): string | undefined {
    const normalized = normalizeEntryName(wanted);
    const direct = entryNames.get(normalized.toLowerCase());
    if (direct) {
        return direct;
    }
    try {
        return entryNames.get(normalizeEntryName(decodeURIComponent(normalized)).toLowerCase());
    }
    catch {
        return undefined;
    }
}

/** href / src 解析成包内相对路径；越出容器根、外链、data: 一律丢掉 */
function resolveHref(baseDir: string, href: string): string | undefined {
    let raw = href.trim();
    if (!raw || raw.startsWith("#") || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) {
        return undefined;
    }
    const hashIndex = raw.indexOf("#");
    if (hashIndex >= 0) {
        raw = raw.slice(0, hashIndex);
    }
    const queryIndex = raw.indexOf("?");
    if (queryIndex >= 0) {
        raw = raw.slice(0, queryIndex);
    }
    try {
        raw = decodeURIComponent(raw);
    }
    catch {
        // 编码坏了就按原样用
    }
    if (!raw) {
        return undefined;
    }
    const joined = raw.startsWith("/")
        ? raw.slice(1)
        : path.posix.join(baseDir === "." ? "" : baseDir, raw);
    const normalized = path.posix.normalize(joined);
    if (!normalized || normalized === "." || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
        return undefined;
    }
    return normalized;
}

function extFromEntryName(entry: string): string | undefined {
    const dot = entry.lastIndexOf(".");
    if (dot < 0) {
        return undefined;
    }
    const ext = entry.slice(dot + 1).toLowerCase();
    return EPUB_PAGE_EXT.includes(ext) ? ext : undefined;
}

async function readEntryBytes(handle: EpubHandle, entry: string): Promise<Buffer> {
    return await withZipLock(handle, async () => {
        try {
            const data = await handle.zip.entryData(entry);
            return Buffer.isBuffer(data) ? data : Buffer.from(data);
        }
        catch (e) {
            console.error(`读取 EPUB 条目失败：${entry}`, e);
            throw new BookError(400, BROKEN_MESSAGE);
        }
    });
}

function withZipLock<T>(handle: EpubHandle, task: () => Promise<T>): Promise<T> {
    const previous = handle.chain;
    let release: () => void = () => undefined;
    handle.chain = new Promise<void>((resolve) => {
        release = resolve;
    });
    return previous.then(task, task).finally(() => release());
}

/** 页扩展名：先信条目名，认不出再读一次字节按 magic 判（有的包把图叫 image001.dat） */
async function pageExtFor(handle: EpubHandle, entry: string): Promise<string | undefined> {
    const fromName = extFromEntryName(entry);
    if (fromName) {
        return fromName;
    }
    return sniffImageExt(await readEntryBytes(handle, entry));
}

/**
 * 从一页 XHTML / SVG 里找「唯一的那张图」。
 * 合法 XML 走解析；不是合法 XML 的 XHTML（HTML 写法）退回一次容错扫描，只数图片 + 取 src。
 */
function findPageImageSrc(text: string, baseDir: string): string | undefined {
    const parsed = parseXml(text);
    const images: Record<string, unknown>[] = [];
    if (parsed) {
        walk(parsed, (tag, value) => {
            const name = localName(tag);
            if (name === "img" || name === "image") {
                images.push(value);
            }
        });
    }
    if (parsed && images.length === 1) {
        const src = attr(images[0]!, "src", "href");
        const resolved = src ? resolveHref(baseDir, src) : undefined;
        if (resolved) {
            return resolved;
        }
    }
    if (images.length !== 0) {
        // 多图页 / 唯一那张图的地址解析不出来：都按「不是一图一页」处理
        return undefined;
    }
    const matches = [...text.matchAll(/<(img|image)\b([^>]*)>/gi)];
    if (matches.length !== 1) {
        return undefined;
    }
    const srcMatch = /(?:src|(?:xlink:)?href)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(matches[0]![2] ?? "");
    const src = srcMatch?.[1] ?? srcMatch?.[2];
    return src ? resolveHref(baseDir, src) : undefined;
}

async function assertNoDrm(handle: EpubHandle) {
    // Readium LCP 的授权文件；有它就不是能直接读的包
    if (resolveEntry(handle.entryNames, "META-INF/license.lcpl")) {
        throw new BookError(415, DRM_MESSAGE);
    }
    const entry = resolveEntry(handle.entryNames, "META-INF/encryption.xml");
    if (!entry) {
        return;
    }
    const parsed = parseXml((await readEntryBytes(handle, entry)).toString("utf8"));
    if (!parsed) {
        return;
    }
    const algorithms: string[] = [];
    let encryptedDataCount = 0;
    walk(parsed, (tag, value) => {
        const name = localName(tag);
        if (name === "encryptionmethod") {
            const algorithm = attr(value, "algorithm");
            if (algorithm) {
                algorithms.push(algorithm.toLowerCase());
            }
        }
        else if (name === "encrypteddata") {
            encryptedDataCount++;
        }
    });
    const blocked = algorithms.filter((algorithm) => !FONT_OBFUSCATION_ALGORITHMS.includes(algorithm));
    if (blocked.length || (encryptedDataCount > 0 && algorithms.length === 0)) {
        throw new BookError(415, DRM_MESSAGE);
    }
}

async function readSpine(handle: EpubHandle): Promise<EpubPage[]> {
    const containerEntry = resolveEntry(handle.entryNames, "META-INF/container.xml");
    if (!containerEntry) {
        throw new BookError(400, BROKEN_MESSAGE);
    }
    const containerText = (await readEntryBytes(handle, containerEntry)).toString("utf8");
    const rootFile = findRootFilePath(parseXml(containerText));
    if (!rootFile) {
        throw new BookError(400, BROKEN_MESSAGE);
    }
    const opfEntry = resolveEntry(handle.entryNames, rootFile);
    if (!opfEntry) {
        throw new BookError(400, BROKEN_MESSAGE);
    }
    await assertNoDrm(handle);
    const opf = parseXml((await readEntryBytes(handle, opfEntry)).toString("utf8"));
    if (!opf) {
        throw new BookError(400, BROKEN_MESSAGE);
    }
    const manifestNode = firstTag(opf, "manifest");
    const spineNode = firstTag(opf, "spine");
    if (!manifestNode || !spineNode) {
        throw new BookError(400, BROKEN_MESSAGE);
    }
    const manifest = new Map<string, { href: string; mediaType: string }>();
    for (const item of collectByTag(manifestNode, "item")) {
        const id = attr(item, "id");
        const href = attr(item, "href");
        if (!id || !href) {
            continue;
        }
        manifest.set(id, { href, mediaType: (attr(item, "media-type") ?? "").toLowerCase() });
    }
    const opfDir = path.posix.dirname(opfEntry.replace(/\\/g, "/"));
    const refs = collectByTag(spineNode, "itemref");
    if (!refs.length) {
        throw new BookError(400, BROKEN_MESSAGE);
    }
    const pages: EpubPage[] = [];
    for (const itemref of refs) {
        const idref = attr(itemref, "idref");
        const item = idref ? manifest.get(idref) : undefined;
        if (!item) {
            throw new BookError(400, BROKEN_MESSAGE);
        }
        const target = resolveHref(opfDir, item.href);
        const entry = target ? resolveEntry(handle.entryNames, target) : undefined;
        if (!entry) {
            throw new BookError(400, BROKEN_MESSAGE);
        }
        // SVG 也是「页面里含一张图」的标记语言，要先走下面的取图分支，不能当直接的图片页
        if (item.mediaType.startsWith("image/") && item.mediaType !== "image/svg+xml") {
            const ext = await pageExtFor(handle, entry);
            // 认不出类型的候选跳过（spec §2.2）；整本都认不出时下面会报「没有可显示的页面」
            if (ext) {
                pages.push({ entry, ext });
            }
            continue;
        }
        if (item.mediaType === "application/xhtml+xml"
            || item.mediaType === "text/html"
            || item.mediaType === "application/xml"
            || item.mediaType === "text/xml"
            || item.mediaType === "image/svg+xml") {
            const chapterText = (await readEntryBytes(handle, entry)).toString("utf8");
            const chapterDir = path.posix.dirname(entry.replace(/\\/g, "/"));
            const imageTarget = findPageImageSrc(chapterText, chapterDir);
            const imageEntry = imageTarget ? resolveEntry(handle.entryNames, imageTarget) : undefined;
            if (!imageEntry) {
                // 文字页 / 无图页 / 多图页：整本拒绝，不做残书
                throw new BookError(415, TEXT_MESSAGE);
            }
            const ext = await pageExtFor(handle, imageEntry);
            if (!ext) {
                throw new BookError(415, TEXT_MESSAGE);
            }
            pages.push({ entry: imageEntry, ext });
            continue;
        }
        throw new BookError(415, TEXT_MESSAGE);
    }
    if (!pages.length) {
        throw new BookError(400, EMPTY_MESSAGE);
    }
    if (pages.length > BOOK_PAGE_LIMIT) {
        throw new BookError(400, "页数超过上限，暂不支持。");
    }
    return pages;
}

const handleCache = new Map<string, EpubHandle>();
const opening = new Map<string, Promise<EpubHandle>>();

async function closeEpub(key: string, handle: EpubHandle) {
    if (handleCache.get(key) === handle) {
        handleCache.delete(key);
    }
    // 先等手上的读跑完，再关句柄；不然正在读的那一页会报「Archive closed」
    try {
        await handle.chain;
    }
    catch {
        // 读失败无所谓，反正接下来就关闭
    }
    try {
        await handle.zip.close();
    }
    catch {
        // 打开就失败的包，close 也会失败
    }
}

async function openEpubUncached(absPath: string): Promise<EpubHandle> {
    const stat = await fsp.stat(absPath);
    const cached = handleCache.get(absPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
        // 命中即提到队尾，Map 的插入顺序就是 LRU 顺序
        handleCache.delete(absPath);
        handleCache.set(absPath, cached);
        return cached;
    }
    if (cached) {
        await closeEpub(absPath, cached);
    }
    const zip = new StreamZip.async({
        file: absPath,
        nameEncoding: process.env.DEFAULT_ZIPCODE?.trim() || undefined
    });
    const handle: EpubHandle = {
        zip,
        mtimeMs: stat.mtimeMs,
        entryNames: new Map(),
        pages: [],
        chain: Promise.resolve()
    };
    try {
        const entries = await zip.entries();
        for (const name of Object.keys(entries)) {
            handle.entryNames.set(normalizeEntryName(name).toLowerCase(), name);
        }
        handle.pages = await readSpine(handle);
    }
    catch (e) {
        await zip.close().catch(() => undefined);
        if (e instanceof BookError) {
            throw e;
        }
        console.error("打开 EPUB 失败:", absPath, e);
        throw new BookError(400, BROKEN_MESSAGE);
    }
    handleCache.set(absPath, handle);
    while (handleCache.size > HANDLE_LRU) {
        const oldestKey = handleCache.keys().next().value as string | undefined;
        if (!oldestKey) {
            break;
        }
        const oldest = handleCache.get(oldestKey);
        if (!oldest) {
            break;
        }
        await closeEpub(oldestKey, oldest);
    }
    return handle;
}

async function openEpub(absPath: string): Promise<EpubHandle> {
    const pending = opening.get(absPath);
    if (pending) {
        return await pending;
    }
    const task = openEpubUncached(absPath).finally(() => {
        if (opening.get(absPath) === task) {
            opening.delete(absPath);
        }
    });
    opening.set(absPath, task);
    return await task;
}

/** 页列表：只解析容器结构，不读页图本体（页数多时只多一点读 XHTML 的小开销） */
export async function getEpubPageList(absPath: string, f: ViewFileType): Promise<ComicFileType[]> {
    const handle = await openEpub(absPath);
    return buildBookPageList(f, handle.pages.map((page) => page.ext));
}

/** 取页：直接透传包内原始字节，不转码、不落盘、不缓存（与 spec §3.4 一致） */
export async function getEpubPageBuffer(opts: {
    absPath: string;
    relPath: string;
    index: number;
}): Promise<{ buffer: Buffer; ext: string } | undefined> {
    const handle = await openEpub(opts.absPath);
    if (!Number.isInteger(opts.index) || opts.index < 0 || opts.index >= handle.pages.length) {
        return undefined;
    }
    const page = handle.pages[opts.index]!;
    const buffer = await readEntryBytes(handle, page.entry);
    if (!buffer.length) {
        return undefined;
    }
    // 以字节为准给 Content-Type：条目名和真实类型对不上是常事
    return { buffer, ext: sniffImageExt(buffer) ?? page.ext };
}
