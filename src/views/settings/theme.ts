import type { GlobalThemeOverrides } from "naive-ui";

/** 全站 naive 控件（抽屉、下拉、对话框、消息）统一成朱红 + 2px 圆角 */
export const appThemeOverrides: GlobalThemeOverrides = {
    common: {
        primaryColor: "#E2503A",
        primaryColorHover: "#EC6A55",
        primaryColorPressed: "#C8442F",
        primaryColorSuppl: "#E2503A",
        borderRadius: "2px",
        bodyColor: "#101014",
        cardColor: "#17171b",
        modalColor: "#17171b",
        popoverColor: "#17171b",
        tableColor: "#101014",
        textColorBase: "#f0ebe1",
        textColor1: "#f0ebe1",
        textColor2: "#cfc9be",
        textColor3: "#a09b91",
        borderColor: "#2b2b33",
        dividerColor: "#2b2b33",
        fontFamily:
            '"MiSans", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif'
    }
};

/** 兼容旧引用：设置页与阅读设置抽屉仍按这个名字引入 */
export const settingsThemeOverrides = appThemeOverrides;
