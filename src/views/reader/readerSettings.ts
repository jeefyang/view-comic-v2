import { reactive, watch } from "vue";

export type ReaderModeType = "waterfall" | "paged";
export type FitModeType = "fit" | "width" | "height" | "rotate";
export type PageDirectionType = "ltr" | "rtl";
/** 单页视频播放/暂停按钮的位置 */
export type VideoPlayPositionType = "top-left" | "bottom-left" | "top-right" | "bottom-right" | "center";

const STORAGE_KEY = "readerSettings";

const defaults = {
    /** 阅读模式：瀑布流 / 单页翻页 */
    mode: "waterfall" as ReaderModeType,
    /** 单页模式的适配方式 */
    fitMode: "fit" as FitModeType,
    /** 翻页方向：ltr 左到右（下一页在右侧），rtl 相反 */
    direction: "ltr" as PageDirectionType,
    /** 单页模式：宽度大于高度的双开页自动拆成左右两屏 */
    splitSpread: false,
    /** 单页视频页播放/暂停按钮的位置 */
    videoPlayButtonPosition: "top-left" as VideoPlayPositionType
};

export type ReaderSettings = typeof defaults;

export const readerSettings = reactive({ ...defaults });

const isMode = (v: any): v is ReaderModeType => v === "waterfall" || v === "paged";
const isFitMode = (v: any): v is FitModeType => v === "fit" || v === "width" || v === "height" || v === "rotate";
const isDirection = (v: any): v is PageDirectionType => v === "ltr" || v === "rtl";
const isVideoPlayPosition = (v: any): v is VideoPlayPositionType =>
    v === "top-left" || v === "bottom-left" || v === "top-right" || v === "bottom-right" || v === "center";

const load = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object") {
            return;
        }
        // 逐项校验，脏数据整项忽略
        if (isMode(obj.mode)) {
            readerSettings.mode = obj.mode;
        }
        if (isFitMode(obj.fitMode)) {
            readerSettings.fitMode = obj.fitMode;
        }
        if (isDirection(obj.direction)) {
            readerSettings.direction = obj.direction;
        }
        if (typeof obj.splitSpread === "boolean") {
            readerSettings.splitSpread = obj.splitSpread;
        }
        if (isVideoPlayPosition(obj.videoPlayButtonPosition)) {
            readerSettings.videoPlayButtonPosition = obj.videoPlayButtonPosition;
        }
    } catch {
        // 读取失败就用默认值
    }
};

const save = () => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(readerSettings));
    } catch {
        // 隐私模式下可能写不进去，忽略
    }
};

export const resetReaderSettings = () => {
    Object.assign(readerSettings, defaults);
};

load();
watch(readerSettings, save, { deep: true });
