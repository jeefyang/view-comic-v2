export type FloatActionKey = "backToLibrary" | "backToShelf" | "openSettings" | "jumpPage" | "fileList";

/** 悬浮按钮展开后的菜单项，顺序即展示顺序（自上而下） */
export const floatActions: { key: FloatActionKey; label: string }[] = [
    { key: "jumpPage", label: "跳转页码" },
    { key: "fileList", label: "文件列表" },
    { key: "openSettings", label: "阅读设置" },
    { key: "backToShelf", label: "返回书架" },
    { key: "backToLibrary", label: "返回书库" }
];
