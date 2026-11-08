export type FloatActionKey =
    | "backToLibrary"
    | "backToShelf"
    | "openSettings"
    | "jumpPage"
    | "fileList"
    | "toggleBookmark";

/** 悬浮按钮展开后的菜单项，顺序即展示顺序（自上而下） */
export const floatActions: { key: FloatActionKey; label: string }[] = [
    { key: "jumpPage", label: "跳转页码" },
    { key: "toggleBookmark", label: "添加书签" },
    { key: "fileList", label: "文件列表" },
    { key: "openSettings", label: "阅读设置" },
    { key: "backToShelf", label: "返回书架" },
    { key: "backToLibrary", label: "返回书库" }
];

/** 菜单文案随状态变：当前页已有书签时，「添加书签」变成「取消书签」 */
export const floatActionLabel = (key: FloatActionKey, bookmarked: boolean) => {
    if (key === "toggleBookmark") {
        return bookmarked ? "取消书签" : "添加书签";
    }
    return floatActions.find((item) => item.key === key)?.label ?? key;
};
