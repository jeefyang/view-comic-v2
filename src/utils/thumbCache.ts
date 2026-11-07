/**
 * 缩略图的浏览器端缓存（IndexedDB）。
 *
 * 缩略图的成本主要在服务端解码，浏览器这边再存一份就能做到：
 * 刷新页面 / 反复滚动都不需要重新请求，离线时也能看到已看过的封面。
 * IndexedDB 不可用（隐私模式等）时所有方法都退化成 no-op，页面照常工作。
 */

const DB_NAME = "view-comic-thumbs";
const DB_VERSION = 1;
const STORE = "thumbs";
const MAX_ENTRIES = 600;

interface ThumbRecord {
    key: string;
    blob: Blob;
    time: number;
}

let dbPromise: Promise<IDBDatabase | null> | undefined;

function openDb(): Promise<IDBDatabase | null> {
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
        }
        catch {
            resolve(null);
            return;
        }
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "key" });
                store.createIndex("time", "time");
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return dbPromise;
}

export function thumbCacheKey(editUUID: string, width: number, path: string) {
    return `${editUUID}|${width}|${path}`;
}

export async function getThumbBlob(key: string): Promise<Blob | undefined> {
    const db = await openDb();
    if (!db) {
        return undefined;
    }
    return await new Promise((resolve) => {
        try {
            const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
            request.onsuccess = () => {
                const record = request.result as ThumbRecord | undefined;
                resolve(record?.blob);
            };
            request.onerror = () => resolve(undefined);
        }
        catch {
            resolve(undefined);
        }
    });
}

export async function putThumbBlob(key: string, blob: Blob): Promise<void> {
    const db = await openDb();
    if (!db) {
        return;
    }
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put({ key, blob, time: Date.now() } satisfies ThumbRecord);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        }
        catch {
            resolve();
        }
    });
    await trim();
}

/** 超过上限就按写入时间删掉最旧的一批 */
async function trim() {
    const db = await openDb();
    if (!db) {
        return;
    }
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, "readwrite");
            const store = tx.objectStore(STORE);
            const countRequest = store.count();
            countRequest.onsuccess = () => {
                const overflow = countRequest.result - MAX_ENTRIES;
                if (overflow <= 0) {
                    tx.abort();
                    return;
                }
                let removed = 0;
                const cursorRequest = store.index("time").openCursor();
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor || removed >= overflow) {
                        return;
                    }
                    cursor.delete();
                    removed++;
                    cursor.continue();
                };
            };
            tx.oncomplete = () => resolve();
            tx.onabort = () => resolve();
            tx.onerror = () => resolve();
        }
        catch {
            resolve();
        }
    });
}

export async function clearThumbCache(): Promise<void> {
    const db = await openDb();
    if (!db) {
        return;
    }
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        }
        catch {
            resolve();
        }
    });
}
