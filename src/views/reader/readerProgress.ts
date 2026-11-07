/**
 * 阅读进度存储（localStorage）。
 * 以「书库 editUUID + 目录 basePath + 文件名」为 key，同一本书单独记一份。
 */
export interface ReaderProgress {
    /** 0 基页码（当时的排序列里的下标） */
    index: number;
    /** 当时看到的文件名。排序规则改变后下标会失效，靠它把位置找回来 */
    name?: string;
    /** 记录时的总页数，用于判断书是否换过/变短 */
    total: number;
    updateTime: number;
}

type ProgressMap = Record<string, ReaderProgress>;

const STORAGE_KEY = "readerProgress";
/** 最多保留多少本书的进度，超出按最久未读淘汰 */
const MAX_ENTRIES = 200;

const readAll = (): ProgressMap => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const obj = JSON.parse(raw);
        if (!obj || typeof obj != "object") {
            return {};
        }
        return obj as ProgressMap;
    } catch {
        return {};
    }
};

const writeAll = (map: ProgressMap) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // 隐私模式/存储已满：记不住进度不影响阅读
    }
};

export const getProgressKey = (editUUID: string, basePath: string, fileName: string) => {
    return [editUUID, basePath, fileName].join("::");
};

export const loadProgress = (key: string): ReaderProgress | undefined => {
    if (!key) {
        return undefined;
    }
    return readAll()[key];
};

export const saveProgress = (key: string, index: number, total: number, name?: string) => {
    if (!key) {
        return;
    }
    const map = readAll();
    map[key] = {
        index,
        name,
        total,
        updateTime: Date.now()
    };
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
        keys.sort((a, b) => (map[a].updateTime || 0) - (map[b].updateTime || 0));
        for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
            delete map[keys[i]];
        }
    }
    writeAll(map);
};

export const clearProgress = (key: string) => {
    if (!key) {
        return;
    }
    const map = readAll();
    if (!(key in map)) {
        return;
    }
    delete map[key];
    writeAll(map);
};
