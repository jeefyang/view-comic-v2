import { reactive, watch } from "vue";

/**
 * 全局功能开关（与具体页面无关的）。
 * 目前只有缩略图：弱网 / 限流环境可以关掉，书架与文件列表就退回纯图标。
 */
const STORAGE_KEY = "appFeatures";

const defaults = {
    /** 是否请求并显示缩略图 */
    thumbnails: true
};

export type AppFeatures = typeof defaults;
export type AppFeatureKey = keyof AppFeatures;

export const appFeatures = reactive<AppFeatures>({ ...defaults });

function isFeatureKey(key: string): key is AppFeatureKey {
    return Object.prototype.hasOwnProperty.call(defaults, key);
}

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        const data = JSON.parse(raw) as Record<string, unknown>;
        (Object.keys(defaults) as AppFeatureKey[]).forEach((key) => {
            if (isFeatureKey(key) && typeof data[key] === "boolean") {
                appFeatures[key] = data[key] as boolean;
            }
        });
    }
    catch {
        // 存储损坏就按默认值来
    }
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appFeatures));
    }
    catch {
        // 无痕模式等写不进去就只在内存里生效
    }
}

export const setAppFeature = (key: AppFeatureKey, value: boolean) => {
    appFeatures[key] = value;
};

export const resetAppFeatures = () => {
    Object.assign(appFeatures, defaults);
};

load();
watch(appFeatures, save, { deep: true });
