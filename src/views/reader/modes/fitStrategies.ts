import type { FitModeType } from "@/views/reader/readerSettings";

export interface FitResult {
    /** 图片相对原始尺寸的缩放比 */
    scale: number;
    /** 旋转角度，只可能是 0 或 90 */
    rotate: 0 | 90;
    /** 缩放后的原始朝向尺寸（rotate 为 90 时需由调用方旋转绘制） */
    width: number;
    height: number;
}

export const fitModeOptions: { label: string; value: FitModeType; description: string }[] = [
    { label: "自适应", value: "fit", description: "整页完整显示，不裁剪" },
    { label: "宽度适应", value: "width", description: "宽度铺满，纵向可能超出" },
    { label: "高度适应", value: "height", description: "高度铺满，横向可能超出" },
    { label: "旋转适应", value: "rotate", description: "横竖两个朝向里选装得更大的那个；图片完整显示，视频铺满屏幕（可能裁边）" }
];

const identity = (pageW: number, pageH: number): FitResult => ({
    scale: 1,
    rotate: 0,
    width: pageW,
    height: pageH
});

/**
 * 计算单页在视口内的摆放方式。
 * 页面尺寸或视口尺寸未知时退化为 1:1，避免出现 NaN / Infinity。
 */
export const computeFit = (
    pageW: number,
    pageH: number,
    viewW: number,
    viewH: number,
    mode: FitModeType
): FitResult => {
    if (pageW <= 0 || pageH <= 0 || viewW <= 0 || viewH <= 0) {
        return identity(pageW > 0 ? pageW : viewW, pageH > 0 ? pageH : viewH);
    }

    // 旋转适应：0° 与 90° 各算一次「装得下」，取装得更大的朝向，保证整页都在屏幕内
    if (mode === "rotate") {
        const s0 = Math.min(viewW / pageW, viewH / pageH);
        const s90 = Math.min(viewW / pageH, viewH / pageW);
        if (s90 > s0) {
            return { scale: s90, rotate: 90, width: pageW * s90, height: pageH * s90 };
        }
        return { scale: s0, rotate: 0, width: pageW * s0, height: pageH * s0 };
    }

    let scale: number;
    switch (mode) {
        case "width":
            scale = viewW / pageW;
            break;
        case "height":
            scale = viewH / pageH;
            break;
        case "fit":
        default:
            scale = Math.min(viewW / pageW, viewH / pageH);
            break;
    }
    return { scale, rotate: 0, width: pageW * scale, height: pageH * scale };
};

/**
 * 视频专用旋转适应：先选「裁得更少」的朝向，再按 cover 缩放铺满视口。
 *
 * 普通图片用 contain（整页可见），但视频两侧/上下的黑边在手机上很显眼；
 * 视频改为铺满，用少量裁边换掉黑边。想完整显示视频时把适配方式切回「自适应」。
 */
export const computeVideoFit = (
    pageW: number,
    pageH: number,
    viewW: number,
    viewH: number,
): FitResult => {
    if (pageW <= 0 || pageH <= 0 || viewW <= 0 || viewH <= 0) {
        return identity(pageW > 0 ? pageW : viewW, pageH > 0 ? pageH : viewH);
    }

    // cover：取较大的缩放比，保证画面填满视口
    const s0 = Math.max(viewW / pageW, viewH / pageH);
    const s90 = Math.max(viewW / pageH, viewH / pageW);
    if (s90 < s0) {
        return { scale: s90, rotate: 90, width: pageW * s90, height: pageH * s90 };
    }
    return { scale: s0, rotate: 0, width: pageW * s0, height: pageH * s0 };
};
