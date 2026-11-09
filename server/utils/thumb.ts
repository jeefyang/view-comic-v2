import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import sharp from "sharp";
import { imageTypeList, zipTypeList } from "@common/utils/ext.js";
import { sortFileList } from "@common/utils/nameSort.js";
import { getBookThumbBuffer } from "./book/index.js";
import { parsePageName } from "./book/pages.js";
import { DATA_DIR } from "./cache.js";
import { getLibCache, resolveLibRoot } from "./library.js";
import { getMyStreamZip } from "./myStreamZip.js";
import { resolveInsideRoot } from "./pathSafe.js";
import { RenderBusyError, withRenderSlot } from "./renderQueue.js";

/** 缩略图都放这里，跟其他 json 数据同级 */
export const THUMB_DIR = path.join(DATA_DIR, "thumbs");

/** 允许的缩略图宽度（文件名里的「尺寸」） */
export const THUMB_WIDTHS = [160, 240];
export const DEFAULT_THUMB_WIDTH = 160;

const JPEG_QUALITY = 72;

export function isThumbWidth(width: number) {
    return THUMB_WIDTHS.includes(width);
}

/**
 * 缩略图的稳定 id：书库名 + 相对路径 的 sha1 前 20 位。
 * 纯计算、不落库，同一张图任何时候算出来都一样，所以文件名可以直接当索引。
 */
/**
 * 路径归一化：缩略图 id 必须「同一个文件永远同一个 id」，
 * 所以 `compare\a.zip`、`compare/a.zip`、`./compare/a.zip`、`compare//a.zip` 先统一成一种写法再算哈希，
 * 否则同一张图会因为前端入口不同被重复生成好几份。
 */
export function normalizeRelPath(relPath: string) {
    const normalized = String(relPath || "")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/")
        .replace(/^\.\//, "");
    return normalized === "" ? "." : normalized;
}

export function thumbId(libName: string, relPath: string) {
    return crypto.createHash("sha1").update(`${libName}\u0000${normalizeRelPath(relPath)}`).digest("hex").slice(0, 20);
}

/** 最终文件名：{20 位 id}_{宽度}.jpg */
export function thumbFile(id: string, width: number) {
    return path.join(THUMB_DIR, `${id}_${width}.jpg`);
}

function ensureDir() {
    if (!fs.existsSync(THUMB_DIR)) {
        fs.mkdirSync(THUMB_DIR, { recursive: true });
    }
}

/**
 * 同一个路径只提示一次：缩略图缺失会被前端整屏轮询式地重试，
 * 不节流的话日志会被刷爆。
 */
const warned = new Set<string>();

function warnOnce(key: string, message: string) {
    if (warned.has(key)) {
        return;
    }
    if (warned.size > 500) {
        warned.clear();
    }
    warned.add(key);
    console.warn(message);
}

function isImageName(name: string) {
    return imageTypeList.includes(path.extname(name).slice(1).toLowerCase());
}

/** 目录型书籍：按数字自然序取第一个图片文件（img-2 在 img-10 前面） */
async function firstImageInDir(dir: string): Promise<string | undefined> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const names = entries.filter((e) => e.isFile() && isImageName(e.name)).map((e) => e.name);
    if (!names.length) {
        return undefined;
    }
    const sorted = sortFileList(names.map((name) => ({ name })), "number", 1).map((i) => i.name);
    return path.join(dir, sorted[0]!);
}

/**
 * 只装了压缩包的目录（`compare/compare.zip` 这种）：目录里没有直接的图片，
 * 就用目录内第一个压缩包的首图。目录视图的封面本来就想表达「里面是什么书」。
 */
async function firstZipInDir(dir: string): Promise<Buffer | undefined> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const names = entries
        .filter((e) => e.isFile() && path.extname(e.name).slice(1).toLowerCase() === "zip")
        .map((e) => e.name);
    if (!names.length) {
        return undefined;
    }
    const sorted = sortFileList(names.map((name) => ({ name })), "number", 1).map((i) => i.name);
    // 只试前面几个包：一个目录里有几十个包时，别为了封面把队列占满
    for (const name of sorted.slice(0, 3)) {
        const buffer = await firstImageInZip(path.join(dir, name));
        if (buffer) {
            return buffer;
        }
    }
    return undefined;
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
}

/** 压缩包：取包内第一张图片（fileList 已按包内顺序过滤成 image/video） */
async function firstImageInZip(file: string): Promise<Buffer | undefined> {
    const [zip, err] = await getMyStreamZip(file);
    if (err || !zip) {
        return undefined;
    }
    const index = zip.fileList.findIndex((item) => item.extType === "image");
    if (index < 0) {
        return undefined;
    }
    const stream = await withZipLock(zip, () => zip.getFileByIndex(index));
    if (!stream) {
        return undefined;
    }
    return await readAll(stream);
}

/** 能当「伪目录」的容器后缀：压缩包（含 cbz）与三种电子书 */
const CONTAINER_SUFFIXES = [".zip", ".cbz", ".pdf", ".epub", ".mobi", ".azw3"];

/** 容器书（页要现渲染）；zip / cbz 仍走 node-stream-zip */
function isBookContainer(file: string) {
    const ext = path.extname(file).slice(1).toLowerCase();
    return ext === "pdf" || ext === "epub" || ext === "mobi" || ext === "azw3";
}

/**
 * `img.zip/0001.jpg`、`book.pdf/0000001.jpg` 这种「容器 + 内部条目」的写法，拆成两段。
 * 阅读页的文件列表要按页出缩略图，而页在容器内没有独立磁盘路径，只能这么表达。
 *
 * 从右往左找 `/`，要求切出来的那一段以容器后缀结尾、并且在磁盘上真实存在：
 * 书库路径里完全可能出现 `旧包.zip/...` 这样的目录名，从左往右切会张冠李戴。
 * 只认单段条目名（页名是平的），所以按最后一个 `/` 切就够。
 */
function splitContainerEntry(relPath: string, root: string): { containerPath: string; entry: string } | undefined {
    const lower = relPath.toLowerCase();
    let at = lower.lastIndexOf("/");
    while (at > 0) {
        const containerPath = relPath.slice(0, at);
        const lowerPath = lower.slice(0, at);
        if (CONTAINER_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix))) {
            const abs = path.isAbsolute(containerPath) ? containerPath : path.join(root, containerPath);
            if (fs.existsSync(abs)) {
                return { containerPath, entry: relPath.slice(at + 1) };
            }
        }
        at = lower.lastIndexOf("/", at - 1);
    }
    return undefined;
}

/** 包内条目名的归一化：反斜杠、开头的 `./`、大小写都不敏感 */
function entryKey(name: string) {
    return name.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

/**
 * 每个压缩包实例的「条目名 → 下标」索引，只建一次。
 * 1600 页的包如果每个缩略图都线性扫一遍 fileList，滚动时会白烧 CPU。
 */
const zipIndexCache = new WeakMap<object, Map<string, number>>();

function zipIndex(zip: { fileList: ComicFileType[] }) {
    let map = zipIndexCache.get(zip);
    if (map) {
        return map;
    }
    map = new Map();
    for (let i = 0; i < zip.fileList.length; i++) {
        const key = entryKey(zip.fileList[i]!.name);
        if (!map.has(key)) {
            map.set(key, i);
            // 有些包里的条目带目录前缀，再补一个「只按文件名」的备选
            const base = key.split("/").pop();
            if (base && !map.has(base)) {
                map.set(base, i);
            }
        }
    }
    zipIndexCache.set(zip, map);
    return map;
}

/**
 * 同一个压缩包上的读取排队执行。
 * node-stream-zip 的实例是共享的，同时开 4 条流解压大图内存会顶上去，
 * 也没必要让它们抢同一个文件句柄。
 */
const zipQueues = new WeakMap<object, Promise<unknown>>();

function withZipLock<T>(zip: object, task: () => Promise<T>): Promise<T> {
    const prev = zipQueues.get(zip) ?? Promise.resolve();
    const next = prev.then(task, task);
    zipQueues.set(zip, next.then(
        () => undefined,
        () => undefined
    ));
    return next;
}

/** 取压缩包里某个条目的原始字节 */
async function zipEntryBuffer(file: string, entry: string): Promise<Buffer | undefined> {
    const [zip, err] = await getMyStreamZip(file);
    if (err || !zip) {
        return undefined;
    }
    const index = zipIndex(zip).get(entryKey(entry));
    if (index === undefined) {
        return undefined;
    }
    const stream = await withZipLock(zip, () => zip.getFileByIndex(index));
    if (!stream) {
        return undefined;
    }
    // 这里不要调 zip.finishStream()：那个方法会把同一个包上别的请求（比如正在读的一页）一起关掉
    return await readAll(stream);
}

async function render(source: string | Buffer, out: string, width: number): Promise<Buffer> {
    const buffer = await sharp(source)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, progressive: true })
        .toBuffer();
    // 先写临时文件再 rename，避免并发请求读到只写了一半的图
    const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, buffer);
    await fsp.rename(tmp, out);
    return buffer;
}

/** 同一张缩略图的并发生成合并成一个 Promise，避免重复解码 */
const generating = new Map<string, Promise<Buffer | undefined>>();

/**
 * 排队太满时抛这个，路由层翻译成 503 + Retry-After，让前端稍后再来。
 * 队列本身已抽到 renderQueue.ts（与容器书页图共用同一组槽位），
 * 这里保留原来的导出名，路由层与前端已有引用不用改。
 */
export { RenderBusyError as ThumbBusyError };

/** 简单的命中/未命中计数，方便排查「怎么老是重新生成」 */
export const thumbStats = { hit: 0, miss: 0, busy: 0, failed: 0 };

/** 取缩略图：命中磁盘直接返回，没有就按需生成；生成不了（视频/空包/无图目录）返回 undefined */
export async function getThumbBuffer(editUUID: string, relPath: string, width: number): Promise<Buffer | undefined> {
    const size = isThumbWidth(width) ? width : DEFAULT_THUMB_WIDTH;
    const lib = getLibCache().find((item) => item.editUUID === editUUID);
    const root = lib ? resolveLibRoot(lib.pathUrl) : undefined;
    if (!root) {
        warnOnce(`nolib:${editUUID}`, `[thumb] 取不到缩略图：没有找到 editUUID=${editUUID} 对应的书库（检查 data/library.json）`);
        return undefined;
    }
    const rel = normalizeRelPath(relPath);
    const containerSplit = splitContainerEntry(rel, root);
    const target = resolveInsideRoot(root, containerSplit ? containerSplit.containerPath : rel);
    if (!target || !fs.existsSync(target)) {
        warnOnce(`nofile:${editUUID}:${rel}`, `[thumb] 取不到缩略图：路径不存在或越界 ${rel}（书库根 ${root}）`);
        return undefined;
    }

    const id = thumbId(lib?.name || root, rel);
    const out = thumbFile(id, size);
    try {
        if (fs.existsSync(out)) {
            thumbStats.hit++;
            return await fsp.readFile(out);
        }
    }
    catch {
        // 读失败就当没缓存，走下面的重新生成
    }

    const pendingKey = `${id}_${size}`;
    const pending = generating.get(pendingKey);
    if (pending) {
        return await pending;
    }
    thumbStats.miss++;
    const run = withRenderSlot(async () => {
        try {
            let source: string | Buffer | undefined;
            if (containerSplit) {
                if (isBookContainer(containerSplit.containerPath)) {
                    // 页名里带了页码就渲染那一页；书架封面路径只有容器，取第 1 页
                    const pageIndex = parsePageName(path.basename(containerSplit.entry)) ?? 0;
                    source = await getBookThumbBuffer({
                        libName: lib?.name || root,
                        absPath: target,
                        relPath: containerSplit.containerPath,
                        pageIndex,
                        width: size
                    });
                }
                else {
                    source = await zipEntryBuffer(target, containerSplit.entry);
                }
            }
            else {
                const stat = await fsp.stat(target);
                if (stat.isDirectory()) {
                    source = await firstImageInDir(target);
                    if (!source) {
                        source = await firstZipInDir(target);
                    }
                }
                else if (isImageName(target)) {
                    source = target;
                }
                else if (zipTypeList.includes(path.extname(target).slice(1).toLowerCase())) {
                    // 书架封面：压缩包（zip / cbz）取包内第一张图
                    source = await firstImageInZip(target);
                }
                else if (isBookContainer(target)) {
                    // 书架封面：只给容器文件，取第 1 页
                    source = await getBookThumbBuffer({
                        libName: lib?.name || root,
                        absPath: target,
                        relPath: rel,
                        pageIndex: 0,
                        width: size
                    });
                }
            }
            if (!source) {
                warnOnce(`nosrc:${editUUID}:${rel}`, `[thumb] 取不到缩略图：${rel} 里没有可用的图片（目录为空 / 压缩包里没图片 / 不是图片文件）`);
                return undefined;
            }
            ensureDir();
            return await render(source, out, size);
        }
        catch (e) {
            thumbStats.failed++;
            console.error("生成缩略图失败:", rel, e);
            return undefined;
        }
    });
    // 队列满是在进入任务之前抛的，得在这里记一笔，不然 busy 计数永远是 0
    const task = run
        .catch((e: unknown) => {
            if (e instanceof RenderBusyError) {
                thumbStats.busy++;
            }
            throw e;
        })
        .finally(() => {
            generating.delete(pendingKey);
        });
    generating.set(pendingKey, task);
    return await task;
}

/** 清空缩略图目录，返回删除的文件数 */
export async function clearThumbs(): Promise<number> {
    ensureDir();
    const names = await fsp.readdir(THUMB_DIR);
    let count = 0;
    for (const name of names) {
        const file = path.join(THUMB_DIR, name);
        try {
            const stat = await fsp.stat(file);
            if (!stat.isFile()) {
                continue;
            }
            await fsp.unlink(file);
            count++;
        }
        catch {
            // 单个文件删不掉不影响其余清理
        }
    }
    return count;
}
