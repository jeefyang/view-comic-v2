import { computed, ref } from "vue";
import { userFetch } from "@/utils/jFetch";
import { useConfigStore } from "@/stores/config";
import { cloneTapZones, normalizeTapZones, saveTapZones, tapZones } from "./useTapZones";
import type { TapZone } from "./types";

/** 名字按去空格后的字符串做唯一键，同名即覆盖 */
const MAX_NAME_LENGTH = 40;

/** 当前用户云端保存的布局：name -> zones */
export const tapZoneLayouts = ref<Record<string, TapZone[]>>({});
export const layoutsLoaded = ref(false);
export const layoutsBusy = ref(false);
export const layoutsError = ref("");

export const layoutNameList = computed(() =>
    Object.keys(tapZoneLayouts.value).sort((a, b) => a.localeCompare(b, "zh-CN"))
);

const normalizeName = (name: string) => name.trim().slice(0, MAX_NAME_LENGTH);

/** 把云端任意数据洗成合法布局表，坏掉的条目直接丢 */
const normalizeLayouts = (raw: any): Record<string, TapZone[]> => {
    const result: Record<string, TapZone[]> = {};
    if (!raw || typeof raw !== "object") {
        return result;
    }
    for (const [name, zones] of Object.entries(raw as Record<string, unknown>)) {
        const key = normalizeName(name);
        if (!key) {
            continue;
        }
        const list = normalizeTapZones(zones);
        if (list.length) {
            result[key] = list;
        }
    }
    return result;
};

/** 这份缓存属于哪个用户，换账号时必须丢掉重拉，避免把别人的布局显示出来 */
let loadedUserUUID = "";

/** 读取当前登录用户的云端布局（登录态才有 userUUID，天然按用户隔离） */
export const loadLayouts = async (force = false): Promise<Record<string, TapZone[]>> => {
    const configStore = useConfigStore();
    if (!configStore.isLogin) {
        loadedUserUUID = "";
        tapZoneLayouts.value = {};
        layoutsLoaded.value = false;
        layoutsError.value = "登录后才能同步云端布局";
        return tapZoneLayouts.value;
    }
    if (loadedUserUUID !== configStore.userUUID) {
        force = true;
    }
    if (layoutsLoaded.value && !force) {
        return tapZoneLayouts.value;
    }
    layoutsBusy.value = true;
    try {
        const res = await userFetch.request("getUserConfig");
        if (res.code != 200) {
            layoutsError.value = res.msg || "读取云端布局失败";
            return tapZoneLayouts.value;
        }
        tapZoneLayouts.value = normalizeLayouts(res.data?.tapZoneLayouts);
        layoutsError.value = "";
        layoutsLoaded.value = true;
        loadedUserUUID = configStore.userUUID;
    } catch (err: any) {
        layoutsError.value = err?.message || "读取云端布局失败";
    } finally {
        layoutsBusy.value = false;
    }
    return tapZoneLayouts.value;
};

const putLayouts = async (next: Record<string, TapZone[]>): Promise<boolean> => {
    const configStore = useConfigStore();
    if (!configStore.isLogin) {
        layoutsError.value = "登录后才能同步云端布局";
        return false;
    }
    layoutsBusy.value = true;
    try {
        const res = await userFetch.request("setUserConfig", {
            userUUID: configStore.userUUID,
            tapZoneLayouts: next
        });
        if (res.code != 200) {
            layoutsError.value = res.msg || "保存到云端失败";
            return false;
        }
        tapZoneLayouts.value = normalizeLayouts(res.data?.tapZoneLayouts ?? next);
        layoutsLoaded.value = true;
        loadedUserUUID = configStore.userUUID;
        layoutsError.value = "";
        return true;
    } catch (err: any) {
        layoutsError.value = err?.message || "保存到云端失败";
        return false;
    } finally {
        layoutsBusy.value = false;
    }
};

/**
 * 把一份点击区域上传成命名布局；名字已存在就直接覆盖。
 * 传 `zones` 时用编辑器里当前看到的区域，不传才退回到本机已保存的布局。
 */
export const saveLayoutAs = async (name: string, zones?: TapZone[]): Promise<boolean> => {
    const key = normalizeName(name);
    if (!key) {
        layoutsError.value = "布局名称不能为空";
        return false;
    }
    const source = zones?.length ? zones : tapZones.value;
    if (!source.length) {
        layoutsError.value = "当前没有可上传的点击区域";
        return false;
    }
    const next = { ...tapZoneLayouts.value, [key]: cloneTapZones(source) };
    return await putLayouts(next);
};

/** 应用云端布局到当前设备（同时写进本机 localStorage） */
export const applyLayout = (name: string): boolean => {
    const zones = tapZoneLayouts.value[name];
    if (!zones?.length) {
        layoutsError.value = "布局不存在";
        return false;
    }
    saveTapZones(cloneTapZones(zones));
    return true;
};

export const removeLayout = async (name: string): Promise<boolean> => {
    if (!(name in tapZoneLayouts.value)) {
        return false;
    }
    const next = { ...tapZoneLayouts.value };
    delete next[name];
    return await putLayouts(next);
};
