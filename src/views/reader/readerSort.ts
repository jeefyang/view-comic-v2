import { reactive, watch } from "vue";

/** 阅读页可选的排序方式 */
export type ReaderSortType = "updateTime" | "name" | "number";
/** 1 正序，-1 反序 */
export type ReaderSortOrder = 1 | -1;

export const readerSortOptions: { value: ReaderSortType; label: string; description: string }[] = [
    { value: "updateTime", label: "更新时间", description: "按文件修改时间排" },
    { value: "name", label: "文件名", description: "按字符顺序排（img-10 在 img-2 前）" },
    { value: "number", label: "数字", description: "按名字里的数字大小排（img-2 在 img-10 前）" }
];

const defaults = {
    type: "number" as ReaderSortType,
    order: 1 as ReaderSortOrder
};

const STORAGE_KEY = "readerSort";

export const readerSort = reactive({ ...defaults });

const isSortType = (value: unknown): value is ReaderSortType => {
    return value === "updateTime" || value === "name" || value === "number";
};

const load = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        const obj = JSON.parse(raw);
        if (!obj || typeof obj != "object") {
            return;
        }
        if (isSortType(obj.type)) {
            readerSort.type = obj.type;
        }
        if (obj.order === 1 || obj.order === -1) {
            readerSort.order = obj.order;
        }
    } catch {
        // 存储不可用（隐私模式）时用默认值
    }
};

const save = () => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: readerSort.type, order: readerSort.order }));
    } catch {
        // 存不下就只在本次会话生效
    }
};

export const toggleReaderSortOrder = () => {
    readerSort.order = readerSort.order === 1 ? -1 : 1;
};

export const resetReaderSort = () => {
    Object.assign(readerSort, defaults);
};

load();
watch(readerSort, save, { deep: true });
