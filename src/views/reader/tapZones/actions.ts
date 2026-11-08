export type TapActionKey =
    | "none"
    | "setPrev"
    | "setNext"
    | "toggleUI"
    | "openSettings"
    | "backToShelf"
    | "backToLibrary"
    | "jumpPage"
    | "toggleBookmark"
    | "setFitMode";

export interface TapActionMeta {
    key: TapActionKey;
    label: string;
}

/** 点击区域可绑定的动作。新增动作时同步在 readerView 的处理函数里接上。 */
export const tapActions: TapActionMeta[] = [
    { key: "setPrev", label: "上一页" },
    { key: "setNext", label: "下一页" },
    { key: "toggleUI", label: "显示 / 隐藏悬浮按钮" },
    { key: "openSettings", label: "打开阅读设置" },
    { key: "backToShelf", label: "返回书架" },
    { key: "backToLibrary", label: "返回书库" },
    { key: "jumpPage", label: "跳转到指定页" },
    { key: "toggleBookmark", label: "添加 / 取消书签" },
    { key: "setFitMode", label: "切换适配方式" },
    { key: "none", label: "不响应" }
];

export const isTapActionKey = (v: any): v is TapActionKey =>
    tapActions.some(item => item.key === v);

export const tapActionLabel = (key: TapActionKey): string =>
    tapActions.find(item => item.key === key)?.label ?? key;
