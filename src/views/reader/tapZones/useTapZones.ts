import { ref } from "vue";
import { isTapActionKey } from "./actions";
import type { TapZone, TapZonePreset } from "./types";

const STORAGE_KEY = "readerTapZones";
const DEFAULT_URL = "/reader/tap-zones/default.json";
const PRESET_URL = "/reader/tap-zones/index.json";

/** 内置默认布局：左 35% 上一页，中 30% 呼出/隐藏悬浮按钮，右 35% 下一页 */
export const builtinTapZones: TapZone[] = [
    { id: "prev", action: "setPrev", rect: { x: 0, y: 0, width: 0.35, height: 1 } },
    { id: "menu", action: "toggleUI", rect: { x: 0.35, y: 0, width: 0.3, height: 1 } },
    { id: "next", action: "setNext", rect: { x: 0.65, y: 0, width: 0.35, height: 1 } }
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const toNumber = (v: any, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const FIT_MODES = ["fit", "width", "height", "rotate"] as const;

const normalizeZone = (raw: any, index: number): TapZone | null => {
    if (!raw || typeof raw !== "object" || !raw.rect) {
        return null;
    }
    const rect: TapZone["rect"] = {
        x: clamp01(toNumber(raw.rect.x)),
        y: clamp01(toNumber(raw.rect.y)),
        width: clamp01(toNumber(raw.rect.width)),
        height: clamp01(toNumber(raw.rect.height))
    };
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }
    const zone: TapZone = {
        id: typeof raw.id === "string" && raw.id ? raw.id : `zone-${index}`,
        action: isTapActionKey(raw.action) ? raw.action : "none",
        rect
    };
    // 只有「切换适配方式」这个动作才带 fitMode，别的动作一律丢掉这个字段
    if (zone.action === "setFitMode") {
        zone.fitMode = FIT_MODES.includes(raw.fitMode) ? raw.fitMode : "fit";
    }
    return zone;
};

/** 把任意来源的数据洗成合法区域列表，脏数据逐条丢弃 */
export const normalizeTapZones = (raw: any): TapZone[] => {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.zones) ? raw.zones : [];
    return list.map(normalizeZone).filter((zone: TapZone | null): zone is TapZone => !!zone);
};

export const cloneTapZones = (zones: TapZone[]): TapZone[] =>
    zones.map(zone => ({ ...zone, rect: { ...zone.rect } }));

/** 全局共享的当前点击区域（只有一个阅读页，不需要 per-instance 状态） */
export const tapZones = ref<TapZone[]>(cloneTapZones(builtinTapZones));
export const tapZonesLoaded = ref(false);

const readLocal = (): TapZone[] | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const zones = normalizeTapZones(JSON.parse(raw));
        return zones.length ? zones : null;
    } catch {
        return null;
    }
};

const fetchDefault = async (): Promise<TapZone[] | null> => {
    try {
        const res = await fetch(DEFAULT_URL, { cache: "no-cache" });
        if (!res.ok) {
            return null;
        }
        const zones = normalizeTapZones(await res.json());
        return zones.length ? zones : null;
    } catch {
        return null;
    }
};

/** 一次性加载：localStorage 优先，其次 public 默认配置，最后内置常量 */
export const loadTapZones = async (): Promise<TapZone[]> => {
    if (tapZonesLoaded.value) {
        return tapZones.value;
    }
    const zones = readLocal() ?? (await fetchDefault()) ?? cloneTapZones(builtinTapZones);
    tapZones.value = cloneTapZones(zones);
    tapZonesLoaded.value = true;
    return tapZones.value;
};

export const saveTapZones = (zones: TapZone[]): TapZone[] => {
    const next = cloneTapZones(normalizeTapZones(zones));
    tapZones.value = next;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // 写不进去也不影响本次使用
    }
    return next;
};

export const resetTapZones = async (): Promise<TapZone[]> => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
    const zones = (await fetchDefault()) ?? cloneTapZones(builtinTapZones);
    tapZones.value = cloneTapZones(zones);
    tapZonesLoaded.value = true;
    return tapZones.value;
};

let zoneSeq = 0;

export const createTapZone = (): TapZone => ({
    id: `zone-${Date.now().toString(36)}-${zoneSeq++}`,
    action: "setNext",
    rect: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }
});

export type { TapZonePreset };

/** 预设布局：id + 名称 + 区域列表，坐标同样是 0~1 的百分比 */
export interface TapZonePresetItem {
    id: string;
    name: string;
    zones: TapZone[];
}

const preset = (id: string, name: string, zones: Pick<TapZone, "action" | "rect">[]): TapZonePresetItem => ({
    id,
    name,
    zones: zones.map((zone, i) => ({
        id: `${id}-${i}`,
        action: zone.action,
        rect: { ...zone.rect }
    }))
});

export const builtinPresets: TapZonePresetItem[] = [
    preset("vertical3", "竖三分（左右翻页 · 中间按钮）", [
        { action: "setPrev", rect: { x: 0, y: 0, width: 0.35, height: 1 } },
        { action: "toggleUI", rect: { x: 0.35, y: 0, width: 0.3, height: 1 } },
        { action: "setNext", rect: { x: 0.65, y: 0, width: 0.35, height: 1 } }
    ]),
    preset("horizontal3", "横三分（上下翻页 · 中间按钮）", [
        { action: "setPrev", rect: { x: 0, y: 0, width: 1, height: 0.35 } },
        { action: "toggleUI", rect: { x: 0, y: 0.35, width: 1, height: 0.3 } },
        { action: "setNext", rect: { x: 0, y: 0.65, width: 1, height: 0.35 } }
    ]),
    preset("twoColumns", "左右两栏（各占一半）", [
        { action: "setPrev", rect: { x: 0, y: 0, width: 0.5, height: 1 } },
        { action: "setNext", rect: { x: 0.5, y: 0, width: 0.5, height: 1 } }
    ]),
    preset("twoRows", "上下两栏（各占一半）", [
        { action: "setPrev", rect: { x: 0, y: 0, width: 1, height: 0.5 } },
        { action: "setNext", rect: { x: 0, y: 0.5, width: 1, height: 0.5 } }
    ]),
    preset("wideCenter", "两侧窄翻页 · 中间宽按钮", [
        { action: "setPrev", rect: { x: 0, y: 0, width: 0.25, height: 1 } },
        { action: "toggleUI", rect: { x: 0.25, y: 0, width: 0.5, height: 1 } },
        { action: "setNext", rect: { x: 0.75, y: 0, width: 0.25, height: 1 } }
    ])
];

export const tapZonePresets = ref<TapZonePresetItem[]>(builtinPresets.map(clonePreset));

let presetsLoaded = false;

function clonePreset(item: TapZonePresetItem): TapZonePresetItem {
    return { id: item.id, name: item.name, zones: cloneTapZones(item.zones) };
}

const normalizePresets = (raw: any): TapZonePresetItem[] => {
    const list = Array.isArray(raw?.presets) ? raw.presets : Array.isArray(raw) ? raw : [];
    const result: TapZonePresetItem[] = [];
    for (const item of list) {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id) {
            continue;
        }
        const zones = normalizeTapZones(item.zones ?? item);
        if (!zones.length) {
            continue;
        }
        result.push({ id: item.id, name: typeof item.name === "string" && item.name ? item.name : item.id, zones });
    }
    return result;
};

/** 从 public 读取预设布局，失败就继续用内置的 */
export const loadTapZonePresets = async (): Promise<TapZonePresetItem[]> => {
    if (presetsLoaded) {
        return tapZonePresets.value;
    }
    presetsLoaded = true;
    try {
        const res = await fetch(PRESET_URL, { cache: "no-cache" });
        if (res.ok) {
            const presets = normalizePresets(await res.json());
            if (presets.length) {
                tapZonePresets.value = presets;
            }
        }
    } catch {
        // 用内置预设
    }
    return tapZonePresets.value;
};

/** 套用某个预设，返回可编辑的副本（id 重新生成，避免和已有区域撞） */
export const applyTapZonePreset = (id: string): TapZone[] => {
    const presetItem = tapZonePresets.value.find(item => item.id === id) ?? builtinPresets.find(item => item.id === id);
    if (!presetItem) {
        return cloneTapZones(tapZones.value);
    }
    return presetItem.zones.map((zone, i) => ({
        id: `zone-${Date.now().toString(36)}-${i}-${zoneSeq++}`,
        action: zone.action,
        rect: { ...zone.rect }
    }));
};
