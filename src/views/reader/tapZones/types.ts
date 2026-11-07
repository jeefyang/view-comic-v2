import type { FitModeType } from "@/views/reader/readerSettings";
import type { TapActionKey } from "./actions";

/** 归一化坐标：0~1，相对阅读区域左上角 */
export interface TapZoneRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TapZone {
    id: string;
    action: TapActionKey;
    rect: TapZoneRect;
    /** 仅 action 为 "setFitMode" 时有效：点击后切换到这个适配方式 */
    fitMode?: FitModeType;
}

export interface TapZonePreset {
    name: string;
    zones: TapZone[];
}
