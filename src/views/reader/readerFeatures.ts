import { reactive, watch } from "vue";

const STORAGE_KEY = "readerFeatures";

const defaults = {
    /** 底部页码指示器：第 N 页 / 共 M 页 */
    pageIndicator: true,
    /** 页码上方显示当前文件名 */
    fileName: true,
    /** 记住阅读进度，刷新后跳回上次所在页 */
    progressRestore: true,
    /** 左上角「返回书架」按钮 */
    backButton: true
};

export type ReaderFeatures = typeof defaults;
export type ReaderFeatureKey = keyof ReaderFeatures;

/**
 * reader 页功能开关（唯一真相源）。
 * reader 页与设置页共享同一个 reactive 对象，改一处两边立刻生效；
 * 变化自动落盘到 localStorage，组件侧只需读写 `readerFeatures.xxx`。
 */
export const readerFeatures = reactive<ReaderFeatures>({ ...defaults });

const isFeatureKey = (key: string): key is ReaderFeatureKey => key in defaults;

const load = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        const obj = JSON.parse(raw) as Record<string, unknown>;
        if (!obj || typeof obj !== "object") {
            return;
        }
        for (const key in obj) {
            // 忽略未知 key 与非 boolean 值，避免旧版本残留数据污染开关
            if (!isFeatureKey(key) || typeof obj[key] !== "boolean") {
                continue;
            }
            readerFeatures[key] = obj[key];
        }
    } catch {
        // 数据损坏或 localStorage 不可用时保持默认值
    }
};

const save = () => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(readerFeatures));
    } catch {
        // 隐私模式/配额满时静默失败，开关依然在本次会话内有效
    }
};

export const setReaderFeature = (key: ReaderFeatureKey, value: boolean) => {
    readerFeatures[key] = value;
};

export const resetReaderFeatures = () => {
    Object.assign(readerFeatures, defaults);
};

load();

watch(readerFeatures, save, { deep: true });
