import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { DATA_DIR } from "./cache.js";

/**
 * 超大图的降采样服务。
 *
 * 浏览器的解码上限不在格式上：PNG 允许 2³¹ 边长，但 Skia 单边超过约 32767px 就解不出来，
 * 位图内存是 `宽 × 高 × 4` 字节（一张 8192×12000 的图就接近 380MB），PNG 还要额外缓冲。
 * 所以前端在尺寸超线时改请求 `?max=<边长>`，这里用 sharp 等比缩好、落盘缓存。
 */

const CACHE_DIR = path.join(DATA_DIR, "cache", "file");
/** jpeg 质量：降采样后的图只用来兜底显示，88 已经看不出差别 */
const JPEG_QUALITY = 88;
/** 同时解码的降采样任务上限，sharp 是 CPU 密集的，别把整机占满 */
const MAX_CONCURRENT = 2;
/** 单张输入的大小上限，超过就当普通流式返回，避免把内存吃光 */
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
/** sharp 的像素上限（默认 268MP），超大图也允许它先读进来 */
const MAX_INPUT_PIXELS = 268_402_689;

let running = 0;
const waiting: (() => void)[] = [];
/** 同一个 key 的并发请求合并成一次生成 */
const inflight = new Map<string, Promise<ScaledImage | undefined>>();

const acquire = (): Promise<void> => {
    if (running < MAX_CONCURRENT) {
        running++;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
};

const release = () => {
    const next = waiting.shift();
    if (next) {
        // 名额直接转交给下一个等待者，running 保持不变
        next();
    } else {
        running--;
    }
};

const ensureDir = () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
};

export interface ScaledImage {
    buffer: Buffer;
    contentType: string;
}

/** 只有位图才值得降采样；gif / 视频 / 压缩包一律走原链路 */
export const isScalableImage = (name: string): boolean => /\.(png|jpe?g|webp|avif|tiff?|bmp)$/i.test(name);

const cachePath = (keySource: string, maxEdge: number, name: string) => {
    const hash = crypto.createHash("sha1").update(`${keySource}|${maxEdge}`).digest("hex").slice(0, 24);
    // 输出格式跟着源格式走（png 保透明），缓存文件也用对应后缀，方便人工排查
    const ext = /\.png$/i.test(name) ? "png" : "jpg";
    return path.join(CACHE_DIR, `${hash}.${ext}`);
};

const outputOf = (name: string) => (/\.png$/i.test(name)
    ? { format: "png" as const, contentType: "image/png" }
    : { format: "jpeg" as const, contentType: "image/jpeg" });

const resize = async (source: string | Buffer, name: string, maxEdge: number): Promise<ScaledImage | undefined> => {
    const pipeline = sharp(source, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await pipeline.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
        return undefined;
    }
    // 本来就没超线：交给调用方回原图，省一次缩放和一次落盘
    if (Math.max(width, height) <= maxEdge) {
        return undefined;
    }
    const out = outputOf(name);
    const buffer = await pipeline
        .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
        .toFormat(out.format, out.format === "jpeg" ? { quality: JPEG_QUALITY, progressive: true } : { compressionLevel: 9 })
        .toBuffer();
    return { buffer, contentType: out.contentType };
};

/**
 * 取降采样后的图。
 * @param source 文件绝对路径，或已经在内存里的原始字节（压缩包内条目用）
 * @param keySource 缓存键的来源，能唯一标识「这是哪张图」（如 `dir:<绝对路径>` / `zip:<包路径>#<条目名>`）
 * @param maxEdge 目标最长边
 * @returns 小于等于 maxEdge 时返回 undefined（调用方应回原图）
 */
export async function getScaledImage(
    source: string | Buffer,
    keySource: string,
    maxEdge: number,
    name: string
): Promise<ScaledImage | undefined> {
    if (maxEdge <= 0) {
        return undefined;
    }
    if (Buffer.isBuffer(source) && source.length > MAX_INPUT_BYTES) {
        return undefined;
    }
    ensureDir();
    const target = cachePath(keySource, maxEdge, name);
    if (fs.existsSync(target)) {
        try {
            const buffer = fs.readFileSync(target);
            return { buffer, contentType: outputOf(name).contentType };
        } catch {
            // 缓存文件读不了就当没有，重新生成
        }
    }
    const existing = inflight.get(target);
    if (existing) {
        return existing;
    }
    const task = (async () => {
        await acquire();
        try {
            const scaled = await resize(source, name, maxEdge);
            if (!scaled) {
                return undefined;
            }
            // 先写临时文件再改名，避免读到只写了一半的缓存
            const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
            fs.writeFileSync(tmp, scaled.buffer);
            fs.renameSync(tmp, target);
            return scaled;
        } catch (error) {
            console.error("降采样失败:", keySource, error);
            return undefined;
        } finally {
            release();
        }
    })();
    inflight.set(target, task);
    try {
        return await task;
    } finally {
        inflight.delete(target);
    }
}

/** 清空降采样缓存，返回删掉的条数（给「数据」设置页留的口子） */
export const clearScaledImages = (): number => {
    if (!fs.existsSync(CACHE_DIR)) {
        return 0;
    }
    let count = 0;
    for (const name of fs.readdirSync(CACHE_DIR)) {
        try {
            fs.unlinkSync(path.join(CACHE_DIR, name));
            count += 1;
        } catch {
            // 单个文件删不掉就跳过
        }
    }
    return count;
};
