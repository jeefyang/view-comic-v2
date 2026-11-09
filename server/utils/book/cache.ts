import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { DATA_DIR } from "../cache";

/** 页图缓存目录：与 thumbs 同级，备份 / 清理时能一起处理 */
export const PAGE_CACHE_DIR = path.join(DATA_DIR, "pages");

const GB = 1024 * 1024 * 1024;
/** 缓存总量上限，可用 BOOK_PAGE_CACHE_GB 覆盖 */
const DEFAULT_MAX_GB = 2;
/** 超限后一次删掉的比例 */
const EVICT_RATIO = 0.2;
/** 两次容量检查之间的最小间隔：别每写一页都扫一遍目录 */
const CHECK_INTERVAL_MS = 60 * 1000;

function maxCacheBytes() {
    const value = Number(process.env.BOOK_PAGE_CACHE_GB);
    const gb = Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_GB;
    return gb * GB;
}

function normalizeKeyPath(relPath: string) {
    // 与 thumb.ts 的 normalizeRelPath 同一套归一化。
    // 这里不 import 它：thumb.ts 会反向 import 本模块，循环依赖比几行重复更贵。
    const normalized = String(relPath || "")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/")
        .replace(/^\.\//, "");
    return normalized === "" ? "." : normalized;
}

/**
 * 缓存键含 mtimeMs + size：同名文件被替换后自动失效，不会把旧页当成新书。
 * 与缩略图一致，不引入内容指纹 —— 同一路径同名文件就是同一本书。
 */
export function pageCacheKey(libName: string, relPath: string, mtimeMs: number, size: number, index: number, width: number) {
    const source = [libName, normalizeKeyPath(relPath), mtimeMs, size, index, width].join("\u0000");
    return crypto.createHash("sha1").update(source).digest("hex").slice(0, 32);
}

export function pageCacheFile(id: string) {
    return path.join(PAGE_CACHE_DIR, `${id}.jpg`);
}

function ensureDir() {
    if (!fs.existsSync(PAGE_CACHE_DIR)) {
        fs.mkdirSync(PAGE_CACHE_DIR, { recursive: true });
    }
}

export async function readPageCache(id: string): Promise<Buffer | undefined> {
    try {
        return await fsp.readFile(pageCacheFile(id));
    }
    catch {
        return undefined;
    }
}

/** 先写临时文件再 rename：避免并发请求读到只写了一半的图 */
export async function writePageCache(id: string, buffer: Buffer) {
    ensureDir();
    const out = pageCacheFile(id);
    const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, buffer);
    await fsp.rename(tmp, out);
    void evictPageCacheIfNeeded();
}

/** 清空页图缓存，返回删除的文件数 */
export async function clearPageCache(): Promise<number> {
    ensureDir();
    const names = await fsp.readdir(PAGE_CACHE_DIR);
    let count = 0;
    for (const name of names) {
        const file = path.join(PAGE_CACHE_DIR, name);
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

let evicting: Promise<void> | undefined;
let lastCheck = 0;

/** 单飞 + 节流的容量检查；没有超限就什么都不做 */
export function evictPageCacheIfNeeded(): Promise<void> {
    if (evicting) {
        return evicting;
    }
    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) {
        return Promise.resolve();
    }
    lastCheck = Date.now();
    evicting = evictOnce()
        .catch((e) => {
            console.warn("[pages] 清理页图缓存失败:", e);
        })
        .finally(() => {
            evicting = undefined;
        });
    return evicting;
}

async function evictOnce() {
    const limit = maxCacheBytes();
    let names: string[];
    try {
        names = await fsp.readdir(PAGE_CACHE_DIR);
    }
    catch {
        return;
    }
    const files: { file: string; size: number; atime: number }[] = [];
    let total = 0;
    for (const name of names) {
        if (!name.endsWith(".jpg")) {
            continue;
        }
        const file = path.join(PAGE_CACHE_DIR, name);
        try {
            const stat = await fsp.stat(file);
            if (!stat.isFile()) {
                continue;
            }
            total += stat.size;
            files.push({ file, size: stat.size, atime: stat.atimeMs });
        }
        catch {
            // 文件可能刚好被清空接口删掉
        }
    }
    if (total <= limit) {
        return;
    }
    // 删到上限的 80%：一次多删一点，别每写一页都触发一轮淘汰
    const target = total * (1 - EVICT_RATIO);
    files.sort((a, b) => a.atime - b.atime);
    let removed = 0;
    for (const item of files) {
        if (total - removed <= target) {
            break;
        }
        try {
            await fsp.unlink(item.file);
            removed += item.size;
        }
        catch {
            // 删不掉就跳过一个
        }
    }
    if (removed > 0) {
        console.log(`[pages] 页图缓存超限，已清理 ${(removed / 1024 / 1024).toFixed(0)}MB（原有 ${(total / 1024 / 1024).toFixed(0)}MB）`);
    }
}
