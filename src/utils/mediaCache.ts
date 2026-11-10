/**
 * 阅读页媒体缓存（IndexedDB + 统一 LRU）。
 *
 * 只缓存真正显示/播放过的页图与视频；书架/文件列表的缩略图仍走 view-comic-thumbs，
 * 不占这里的 2GiB / 2000 条预算。IndexedDB 不可用（隐私模式、旧浏览器）时全部降级为
 * no-op，调用方回网络，阅读本身不受影响。
 *
 * 局域网 http://<ip>:<port> 不是安全上下文，Cache API 与 navigator.storage 都不可用，
 * 因此这里只用 IndexedDB，不依赖 Service Worker。
 */
import { reactive, watch } from "vue";
import { FILE_URL_VERSION, normalizeBasePath } from "@/utils/fileUrl";

export type MediaKind = "image" | "video";

export interface MediaCacheSettings {
    /** 目标容量上限（字节） */
    maxBytes: number;
    /** 图片 + 视频合计条目上限 */
    maxEntries: number;
}

export interface MediaCacheStats {
    count: number;
    bytes: number;
    imageCount: number;
    imageBytes: number;
    videoCount: number;
    videoBytes: number;
    configuredBytes: number;
    realCap: number;
    videoCap: number;
    maxEntries: number;
}

export type MediaPutResult = "cached" | "skipped" | "full" | "quota" | "unavailable" | "error";

export interface MediaCacheKeyInput {
    userScope: string;
    editUUID: string;
    basePath?: string | null;
    kind: MediaKind;
    index: number;
    name?: string;
    version?: string;
}

const DB_NAME = "view-comic-media";
const DB_VERSION = 1;
const MEDIA_STORE = "media";
const META_STORE = "meta";
const STATS_KEY = "__stats__";
const SCHEMA = "1";
const SETTINGS_KEY = "mediaCacheSettings";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 2000;
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
const MAX_KEY_LENGTH = 1024;
const MAX_EVICT_PER_TX = 200;
const TOUCH_INTERVAL = 5 * 60 * 1000;

interface MediaRecord {
    key: string;
    blob: Blob;
}

interface MetaRecord {
    key: string;
    bytes: number;
    kind: MediaKind;
    lastAccess: number;
}

interface StatsRecord {
    count: number;
    bytes: number;
    imageCount: number;
    imageBytes: number;
    videoCount: number;
    videoBytes: number;
}

const emptyStats = (): StatsRecord => ({
    count: 0,
    bytes: 0,
    imageCount: 0,
    imageBytes: 0,
    videoCount: 0,
    videoBytes: 0
});

const normalizeStats = (value: unknown): StatsRecord => {
    const raw = (value ?? {}) as Partial<StatsRecord>;
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    const count = num(raw.count);
    return {
        count,
        bytes: num(raw.bytes),
        imageCount: num(raw.imageCount),
        imageBytes: num(raw.imageBytes),
        videoCount: num(raw.videoCount),
        videoBytes: num(raw.videoBytes)
    };
};

const readSettings = (): MediaCacheSettings => {
    let raw: Partial<MediaCacheSettings> = {};
    try {
        const text = typeof localStorage === "undefined" ? "" : localStorage.getItem(SETTINGS_KEY);
        if (text) {
            raw = JSON.parse(text) as Partial<MediaCacheSettings>;
        }
    } catch {
        raw = {};
    }
    const maxBytes = typeof raw.maxBytes === "number" && Number.isFinite(raw.maxBytes) && raw.maxBytes > 0
        ? Math.floor(raw.maxBytes)
        : DEFAULT_MAX_BYTES;
    const maxEntries = typeof raw.maxEntries === "number" && Number.isFinite(raw.maxEntries) && raw.maxEntries > 0
        ? Math.floor(raw.maxEntries)
        : DEFAULT_MAX_ENTRIES;
    return { maxBytes, maxEntries };
};

export const mediaCacheSettings = reactive<MediaCacheSettings>(readSettings());

let settingsReady = false;
watch(
    mediaCacheSettings,
    () => {
        if (!settingsReady) {
            return;
        }
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(mediaCacheSettings));
            }
        } catch {
            // 配额满 / 隐私模式：设置照常生效，只是下次打开回到默认值
        }
    },
    { deep: true }
);
settingsReady = true;

let dbPromise: Promise<IDBDatabase | null> | undefined;

const openDb = (): Promise<IDBDatabase | null> => {
    if (dbPromise) {
        return dbPromise;
    }
    dbPromise = new Promise((resolve) => {
        if (typeof indexedDB === "undefined") {
            resolve(null);
            return;
        }
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch {
            resolve(null);
            return;
        }
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(MEDIA_STORE)) {
                db.createObjectStore(MEDIA_STORE, { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains(META_STORE)) {
                const meta = db.createObjectStore(META_STORE, { keyPath: "key" });
                meta.createIndex("lastAccess", "lastAccess");
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return dbPromise;
};

const readMeta = (db: IDBDatabase, key: string): Promise<MetaRecord | undefined> => {
    return new Promise((resolve) => {
        try {
            const request = db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(key);
            request.onsuccess = () => resolve(request.result as MetaRecord | undefined);
            request.onerror = () => resolve(undefined);
        } catch {
            resolve(undefined);
        }
    });
};

const readStats = async (db: IDBDatabase): Promise<StatsRecord> => {
    const record = await readMeta(db, STATS_KEY);
    return normalizeStats(record);
};

/**
 * key 必须可逆地定位到一本具体的书和页；不把超长 key 做哈希，直接放弃缓存，
 * 避免哈希碰撞把两张不同的图串在一起。
 */
export const buildMediaKey = (input: MediaCacheKeyInput): string => {
    const scope = (input.userScope ?? "").trim();
    const editUUID = (input.editUUID ?? "").trim();
    if (!scope || !editUUID) {
        return "";
    }
    const basePath = normalizeBasePath(input.basePath);
    const kind: MediaKind = input.kind === "video" ? "video" : "image";
    const name = (input.name ?? "").replace(/[\u0000-\u001f]/g, "");
    const version = input.version ?? FILE_URL_VERSION;
    const key = `mc:${SCHEMA}:${scope}:${editUUID}:${basePath}:${kind}:${Math.floor(input.index)}:${name}:${version}`;
    return key.length <= MAX_KEY_LENGTH ? key : "";
};

const touchedAt = new Map<string, number>();

const touchMedia = async (key: string): Promise<void> => {
    const now = Date.now();
    const previous = touchedAt.get(key) ?? 0;
    if (now - previous < TOUCH_INTERVAL) {
        return;
    }
    touchedAt.set(key, now);
    const db = await openDb();
    if (!db) {
        return;
    }
    const meta = await readMeta(db, key);
    if (!meta) {
        return;
    }
    try {
        const tx = db.transaction(META_STORE, "readwrite");
        tx.objectStore(META_STORE).put({ ...meta, lastAccess: now } satisfies MetaRecord);
        tx.onerror = () => undefined;
        tx.onabort = () => undefined;
    } catch {
        // 忽略：lastAccess 只是 LRU 排序依据
    }
};

export const getMedia = async (key: string): Promise<{ blob: Blob } | undefined> => {
    if (!key) {
        return undefined;
    }
    const db = await openDb();
    if (!db) {
        return undefined;
    }
    const result = await new Promise<{ blob: Blob } | undefined>((resolve) => {
        try {
            const request = db.transaction(MEDIA_STORE, "readonly").objectStore(MEDIA_STORE).get(key);
            request.onsuccess = () => {
                const record = request.result as MediaRecord | undefined;
                if (record?.blob && typeof record.blob.size === "number") {
                    resolve({ blob: record.blob });
                } else {
                    resolve(undefined);
                }
            };
            request.onerror = () => resolve(undefined);
        } catch {
            resolve(undefined);
        }
    });
    if (result) {
        void touchMedia(key);
    }
    return result;
};

export const hasMedia = async (key: string): Promise<boolean> => {
    if (!key) {
        return false;
    }
    const db = await openDb();
    if (!db) {
        return false;
    }
    return !!(await readMeta(db, key));
};

export const getRealCap = async (configuredBytes: number): Promise<number> => {
    const configured = Math.max(1, Math.floor(configuredBytes));
    try {
        const estimate = typeof navigator !== "undefined" ? navigator.storage?.estimate : undefined;
        if (typeof estimate === "function") {
            const result = await estimate.call(navigator.storage);
            const quota = result?.quota;
            if (typeof quota === "number" && Number.isFinite(quota) && quota > 0) {
                return Math.min(configured, Math.floor(quota * 0.8));
            }
        }
    } catch {
        // 非安全上下文 / 浏览器不支持：回退配置容量
    }
    return configured;
};

export const getMediaCacheLimits = async (): Promise<{
    configuredBytes: number;
    realCap: number;
    videoCap: number;
    maxEntries: number;
}> => {
    const configuredBytes = Math.max(1, Math.floor(mediaCacheSettings.maxBytes));
    const realCap = await getRealCap(configuredBytes);
    return {
        configuredBytes,
        realCap,
        videoCap: Math.min(VIDEO_MAX_BYTES, Math.floor(realCap * 0.25)),
        maxEntries: Math.max(1, Math.floor(mediaCacheSettings.maxEntries))
    };
};

export const getMediaCacheStats = async (): Promise<MediaCacheStats> => {
    const db = await openDb();
    const stats = db ? await readStats(db) : emptyStats();
    const limits = await getMediaCacheLimits();
    return { ...stats, ...limits };
};

export const setMediaPinned = (key: string, pinned: boolean): void => {
    if (!key) {
        return;
    }
    if (pinned) {
        pinnedKeys.add(key);
    } else {
        pinnedKeys.delete(key);
    }
};

let writeBlocked = false;
let errorHandler: ((message: string) => void) | undefined;
let errorNotified = false;

export const setMediaCacheErrorHandler = (handler?: (message: string) => void): void => {
    errorHandler = handler;
    if (handler) {
        errorNotified = false;
    }
};

const notifyWriteError = () => {
    if (errorNotified) {
        return;
    }
    errorNotified = true;
    try {
        errorHandler?.("媒体缓存空间不足，已停止写入；阅读不受影响");
    } catch {
        // 提示失败不能影响阅读
    }
};

const updateStatsForRemove = (stats: StatsRecord, record: MetaRecord) => {
    stats.count = Math.max(0, stats.count - 1);
    stats.bytes = Math.max(0, stats.bytes - record.bytes);
    if (record.kind === "video") {
        stats.videoCount = Math.max(0, stats.videoCount - 1);
        stats.videoBytes = Math.max(0, stats.videoBytes - record.bytes);
    } else {
        stats.imageCount = Math.max(0, stats.imageCount - 1);
        stats.imageBytes = Math.max(0, stats.imageBytes - record.bytes);
    }
};

const writeStats = (store: IDBObjectStore, stats: StatsRecord) => {
    store.put({ key: STATS_KEY, ...stats });
};

/**
 * 写条目、改 stats、按 LRU 淘汰都在同一个 readwrite 事务里完成，
 * 避免“先写后淘汰”期间 stats 与实际条目短暂不一致。
 */
const writeMedia = (db: IDBDatabase, key: string, blob: Blob, kind: MediaKind, limits: Awaited<ReturnType<typeof getMediaCacheLimits>>): Promise<MediaPutResult> => {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (result: MediaPutResult) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };
        let tx: IDBTransaction;
        try {
            tx = db.transaction([MEDIA_STORE, META_STORE], "readwrite");
        } catch {
            settle("error");
            return;
        }
        const mediaStore = tx.objectStore(MEDIA_STORE);
        const metaStore = tx.objectStore(META_STORE);
        let stats: StatsRecord | undefined;
        let old: MetaRecord | undefined;
        let countDelta = 0;
        let bytesDelta = 0;

        const write = () => {
            if (settled || !stats) {
                return;
            }
            const next: StatsRecord = { ...stats };
            if (old) {
                updateStatsForRemove(next, old);
                next.count += 1;
                next.bytes += blob.size;
            } else {
                next.count += 1;
                next.bytes += blob.size;
            }
            if (kind === "video") {
                next.videoCount += 1;
                next.videoBytes += blob.size;
            } else {
                next.imageCount += 1;
                next.imageBytes += blob.size;
            }
            next.count = Math.max(0, next.count);
            next.bytes = Math.max(0, next.bytes);
            mediaStore.put({ key, blob } satisfies MediaRecord);
            metaStore.put({ key, bytes: blob.size, kind, lastAccess: Date.now() } satisfies MetaRecord);
            writeStats(metaStore, next);
        };

        const abortFull = () => {
            settle("full");
            try {
                tx.abort();
            } catch {
                // 事务可能已结束
            }
        };

        const evictInTx = () => {
            let removed = 0;
            const cursorRequest = metaStore.index("lastAccess").openCursor();
            cursorRequest.onsuccess = () => {
                if (settled || !stats) {
                    return;
                }
                const cursor = cursorRequest.result;
                if (!cursor) {
                    abortFull();
                    return;
                }
                const record = cursor.value as MetaRecord;
                if (record.key === key || record.key === STATS_KEY || pinnedKeys.has(record.key)) {
                    cursor.continue();
                    return;
                }
                cursor.delete();
                mediaStore.delete(record.key);
                updateStatsForRemove(stats, record);
                removed += 1;
                const targetCount = stats.count + countDelta;
                const targetBytes = stats.bytes + bytesDelta;
                if (targetCount <= limits.maxEntries && targetBytes <= limits.realCap) {
                    write();
                    return;
                }
                if (removed >= MAX_EVICT_PER_TX) {
                    abortFull();
                    return;
                }
                cursor.continue();
            };
            cursorRequest.onerror = () => abortFull();
        };

        tx.oncomplete = () => settle("cached");
        tx.onerror = () => settle(tx.error?.name === "QuotaExceededError" ? "quota" : "error");
        tx.onabort = () => settle(tx.error?.name === "QuotaExceededError" ? "quota" : "error");

        const statsRequest = metaStore.get(STATS_KEY);
        statsRequest.onsuccess = () => {
            stats = normalizeStats(statsRequest.result);
            if (stats.count === 0 && stats.bytes === 0) {
                stats = emptyStats();
            }
            const oldRequest = metaStore.get(key);
            oldRequest.onsuccess = () => {
                old = oldRequest.result as MetaRecord | undefined;
                countDelta = old ? 0 : 1;
                bytesDelta = blob.size - (old?.bytes ?? 0);
                const targetCount = stats.count + countDelta;
                const targetBytes = stats.bytes + bytesDelta;
                if (targetCount <= limits.maxEntries && targetBytes <= limits.realCap) {
                    write();
                } else {
                    evictInTx();
                }
            };
            oldRequest.onerror = () => settle("error");
        };
        statsRequest.onerror = () => settle("error");
    });
};

const evict = async (count: number): Promise<number> => {
    if (count <= 0) {
        return 0;
    }
    const db = await openDb();
    if (!db) {
        return 0;
    }
    return new Promise((resolve) => {
        let removed = 0;
        let stats: StatsRecord | undefined;
        let finished = false;
        const finish = () => {
            if (finished) {
                return;
            }
            finished = true;
            resolve(removed);
        };
        try {
            const tx = db.transaction([MEDIA_STORE, META_STORE], "readwrite");
            const mediaStore = tx.objectStore(MEDIA_STORE);
            const metaStore = tx.objectStore(META_STORE);
            const statsRequest = metaStore.get(STATS_KEY);
            statsRequest.onsuccess = () => {
                stats = normalizeStats(statsRequest.result);
                const cursorRequest = metaStore.index("lastAccess").openCursor();
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor || removed >= count) {
                        if (stats) {
                            writeStats(metaStore, stats);
                        }
                        return;
                    }
                    const record = cursor.value as MetaRecord;
                    if (record.key === STATS_KEY || pinnedKeys.has(record.key)) {
                        cursor.continue();
                        return;
                    }
                    cursor.delete();
                    mediaStore.delete(record.key);
                    updateStatsForRemove(stats!, record);
                    removed += 1;
                    cursor.continue();
                };
                cursorRequest.onerror = () => finish();
            };
            statsRequest.onerror = () => finish();
            tx.oncomplete = () => finish();
            tx.onerror = () => finish();
            tx.onabort = () => finish();
        } catch {
            finish();
        }
    });
};

export const putMedia = async (key: string, blob: Blob, kind: MediaKind): Promise<MediaPutResult> => {
    if (!key || !blob || typeof blob.size !== "number") {
        return "skipped";
    }
    const db = await openDb();
    if (!db) {
        return "unavailable";
    }
    if (writeBlocked) {
        return "quota";
    }
    const limits = await getMediaCacheLimits();
    if (blob.size > limits.realCap || (kind === "video" && blob.size > limits.videoCap)) {
        return "skipped";
    }
    let result = await writeMedia(db, key, blob, kind, limits);
    if (result === "quota") {
        // 配额报错时先清掉一批最久未用的，再试一次；仍失败就本会话停写。
        const stats = await getMediaCacheStats();
        await evict(Math.max(20, Math.ceil(stats.count * 0.1)));
        result = await writeMedia(db, key, blob, kind, limits);
        if (result === "quota") {
            writeBlocked = true;
            notifyWriteError();
        }
    }
    return result;
};

export const deleteMedia = async (key: string): Promise<void> => {
    if (!key) {
        return;
    }
    const db = await openDb();
    if (!db) {
        return;
    }
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction([MEDIA_STORE, META_STORE], "readwrite");
            const mediaStore = tx.objectStore(MEDIA_STORE);
            const metaStore = tx.objectStore(META_STORE);
            mediaStore.delete(key);
            const metaRequest = metaStore.get(key);
            metaRequest.onsuccess = () => {
                const record = metaRequest.result as MetaRecord | undefined;
                if (!record) {
                    return;
                }
                metaStore.delete(key);
                const statsRequest = metaStore.get(STATS_KEY);
                statsRequest.onsuccess = () => {
                    const stats = normalizeStats(statsRequest.result);
                    updateStatsForRemove(stats, record);
                    writeStats(metaStore, stats);
                };
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
};

export const clearMediaCache = async (): Promise<void> => {
    const db = await openDb();
    if (!db) {
        return;
    }
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction([MEDIA_STORE, META_STORE], "readwrite");
            tx.objectStore(MEDIA_STORE).clear();
            const metaStore = tx.objectStore(META_STORE);
            metaStore.clear();
            writeStats(metaStore, emptyStats());
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
    writeBlocked = false;
    touchedAt.clear();
};

export const clearMediaCacheForUser = async (userScope: string): Promise<void> => {
    const scope = (userScope ?? "").trim();
    if (!scope) {
        return;
    }
    const db = await openDb();
    if (!db || typeof IDBKeyRange === "undefined") {
        return;
    }
    const prefix = `mc:${SCHEMA}:${scope}:`;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction([MEDIA_STORE, META_STORE], "readwrite");
            const mediaStore = tx.objectStore(MEDIA_STORE);
            const metaStore = tx.objectStore(META_STORE);
            const statsRequest = metaStore.get(STATS_KEY);
            statsRequest.onsuccess = () => {
                const stats = normalizeStats(statsRequest.result);
                const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
                const cursorRequest = metaStore.openCursor(range);
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor) {
                        writeStats(metaStore, stats);
                        return;
                    }
                    const record = cursor.value as MetaRecord;
                    cursor.delete();
                    mediaStore.delete(record.key);
                    updateStatsForRemove(stats, record);
                    cursor.continue();
                };
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
    touchedAt.clear();
};

const pinnedKeys = new Set<string>();
