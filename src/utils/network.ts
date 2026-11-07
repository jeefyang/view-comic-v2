import { ref } from "vue";

/**
 * 粗判当前网络是否偏慢。
 *
 * 依赖 Network Information API（Chrome / Edge / Android 浏览器支持，Safari / Firefox 没有），
 * 拿不到时一律按「不慢」处理，保持原有行为不变。
 */
const readEffectiveType = (): string => {
    if (typeof navigator === "undefined") {
        return "";
    }
    const anyNav = navigator as unknown as {
        connection?: { effectiveType?: string };
        mozConnection?: { effectiveType?: string };
        webkitConnection?: { effectiveType?: string };
    };
    const connection = anyNav.connection ?? anyNav.mozConnection ?? anyNav.webkitConnection;
    return connection?.effectiveType ?? "";
};

const isSlowType = (type: string) => type === "slow-2g" || type === "2g" || type === "3g";

/** 是否是慢网（2G / 3G 一档）。会随网络切换自动更新 */
export const slowNetwork = ref(isSlowType(readEffectiveType()));

const sync = () => {
    slowNetwork.value = isSlowType(readEffectiveType());
};

if (typeof navigator !== "undefined") {
    const anyNav = navigator as unknown as {
        connection?: EventTarget;
        mozConnection?: EventTarget;
        webkitConnection?: EventTarget;
    };
    const connection = anyNav.connection ?? anyNav.mozConnection ?? anyNav.webkitConnection;
    connection?.addEventListener?.("change", sync);
}

export const isSlowNetwork = () => slowNetwork.value;
