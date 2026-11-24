import type { GlobalThemeOverrides } from "naive-ui";

/** 设置页与阅读设置抽屉里的 naive 控件（标签页、下拉、确认框）统一成朱红 */
export const settingsThemeOverrides: GlobalThemeOverrides = {
    common: {
        primaryColor: "#E2503A",
        primaryColorHover: "#EC6A55",
        primaryColorPressed: "#C8442F",
        primaryColorSuppl: "#E2503A",
        borderRadius: "2px"
    }
};
