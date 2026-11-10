import { normalizeBasePath, normalizeFileName } from "@/utils/fileUrl";

export type PageSize = { width: number; height: number };

const SIZE_PREFIX = "view:sizes:";
const LRU_KEY = `${SIZE_PREFIX}lru`;
const MAX_BOOKS = 10;
const MAX_ENTRIES = 20_000;
const FLUSH_DELAY = 300;

type SizeRow = [string, number, number];

let flushTimer: ReturnType<typeof setTimeout> | undefined;
const tableCache = new Map<string, Map<string, PageSize>>();
const dirtyKeys = new Set<string>();

const storageGet = (key: string): string | null => {
    try {
        return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    } catch {
        return null;
    }
};

const storageSet = (key: string, value: string): boolean => {
    try {
        if (typeof localStorage === "undefined") return false;
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

const storageRemove = (key: string): void => {
    try {
        if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    } catch {
        // 隐私模式/配额满：丢尺寸缓存即可，阅读不受影响
    }
};

const parseTable = (raw: string | null): Map<string, PageSize> => {
    const table = new Map<string, PageSize>();
    if (!raw) return table;
    try {
        const rows = JSON.parse(raw);
        if (!Array.isArray(rows)) return table;
        for (const row of rows) {
            if (table.size >= MAX_ENTRIES) break;
            if (!Array.isArray(row) || row.length < 3) continue;
            const name = row[0];
            const width = Number(row[1]);
            const height = Number(row[2]);
            if (typeof name !== "string" || !name) continue;
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
            table.set(name, { width: Math.round(width), height: Math.round(height) });
        }
    } catch {
        // 坏数据当作空表，下一次写入会覆盖
    }
    return table;
};

const serializeTable = (table: Map<string, PageSize>): string => {
    const rows: SizeRow[] = [];
    for (const [name, size] of table) {
        if (rows.length >= MAX_ENTRIES) break;
        rows.push([name, size.width, size.height]);
    }
    return JSON.stringify(rows);
};

const readLru = (): string[] => {
    const raw = storageGet(LRU_KEY);
    if (!raw) return [];
    try {
        const keys = JSON.parse(raw);
        if (!Array.isArray(keys)) return [];
        return keys.filter((key): key is string => typeof key === "string" && key.startsWith(SIZE_PREFIX) && key !== LRU_KEY);
    } catch {
        return [];
    }
};

const writeLru = (keys: string[]): void => {
    void storageSet(LRU_KEY, JSON.stringify(keys));
};

/** 最近使用的尺寸表放末尾；超过 10 本时删掉最久未用的表和它的内存缓存 */
const touchLru = (key: string): void => {
    if (!key) return;
    const keys = readLru().filter((item) => item !== key);
    keys.push(key);
    while (keys.length > MAX_BOOKS) {
        const old = keys.shift();
        if (!old) continue;
        storageRemove(old);
        tableCache.delete(old);
        dirtyKeys.delete(old);
    }
    writeLru(keys);
};

const readTable = (key: string): Map<string, PageSize> => {
    const cached = tableCache.get(key);
    if (cached) return cached;
    const table = parseTable(storageGet(key));
    tableCache.set(key, table);
    return table;
};

const writeTable = (key: string, table: Map<string, PageSize>): boolean => {
    if (!key) return false;
    if (!storageSet(key, serializeTable(table))) return false;
    tableCache.set(key, table);
    touchLru(key);
    return true;
};

/** 尺寸表键：书身份一旦不同就绝不复用，避免换书后旧尺寸套到新页上 */
export const pageSizeKey = (
    editUUID: string | null | undefined,
    basePath: string | null | undefined,
    baseFileName: string | null | undefined
): string => {
    const uuid = (editUUID ?? "").trim();
    const name = normalizeFileName(baseFileName);
    if (!uuid || !name) return "";
    return `${SIZE_PREFIX}${uuid}:${normalizeBasePath(basePath)}:${name}`;
};

export const getPageSizes = (
    editUUID: string | null | undefined,
    basePath: string | null | undefined,
    baseFileName: string | null | undefined
): Map<string, PageSize> => {
    const key = pageSizeKey(editUUID, basePath, baseFileName);
    if (!key) return new Map();
    const table = readTable(key);
    if (table.size) touchLru(key);
    return table;
};

export const flushPageSizes = (): void => {
    if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    if (!dirtyKeys.size) return;
    for (const key of Array.from(dirtyKeys)) {
        dirtyKeys.delete(key);
        const table = tableCache.get(key);
        if (table) writeTable(key, table);
    }
};

const scheduleFlush = (): void => {
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        flushPageSizes();
    }, FLUSH_DELAY);
};

/**
 * 记一页的宽高。首屏会连续加载多张图，这里只改内存并合并成一次写入；
 * 写不进去（隐私模式/配额满）只是下次没有占位尺寸，不影响阅读。
 */
export const setPageSize = (
    editUUID: string | null | undefined,
    basePath: string | null | undefined,
    baseFileName: string | null | undefined,
    pageName: string,
    width: number,
    height: number
): boolean => {
    const key = pageSizeKey(editUUID, basePath, baseFileName);
    const name = normalizeFileName(pageName);
    const w = Math.round(width);
    const h = Math.round(height);
    if (!key || !name || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;

    const table = readTable(key);
    const prev = table.get(name);
    if (prev && prev.width === w && prev.height === h) return false;
    if (!prev && table.size >= MAX_ENTRIES) return false;

    table.set(name, { width: w, height: h });
    dirtyKeys.add(key);
    scheduleFlush();
    return true;
};

/**
 * 旧版把宽高塞在 view 的 comicFileList 里。首次加载时搬到尺寸表，
 * 返回 true 表示已经可以安全地把主 view 里的宽高剥掉。
 */
export const migrateLegacyPageSizes = (
    editUUID: string | null | undefined,
    list: Partial<ComicFileListType> | undefined
): boolean => {
    const pages = list?.list;
    if (!editUUID || !pages?.length) return false;
    const key = pageSizeKey(editUUID, list?.basePath, list?.baseFile?.name);
    if (!key) return false;

    let found = false;
    const table = readTable(key);
    for (const item of pages) {
        if (!item?.name || !item.width || !item.height) continue;
        found = true;
        if (table.has(item.name)) continue;
        if (table.size >= MAX_ENTRIES) break;
        table.set(item.name, { width: item.width, height: item.height });
    }
    if (!found) return false;
    return writeTable(key, table);
};
