<template>
    <figure class="st-proof-plate">
        <div
            class="st-plate"
            :class="[`edge-${activeEdge ?? 'none'}`, { 'is-rtl': isSpread && direction === 'rtl', 'is-single': !isSpread }]"
            :style="plateStyle"
            aria-hidden="true"
        >
            <div class="st-plate-screen">
                <div v-for="(_, index) in sheetCount" :key="index" class="st-plate-sheet">
                    <span class="st-plate-num">{{ String(index + 1).padStart(2, "0") }}</span>
                    <div class="st-plate-panel st-plate-panel--wide"></div>
                    <div class="st-plate-panel"></div>
                    <div class="st-plate-panel"></div>
                    <div class="st-plate-panel st-plate-panel--wide"></div>
                </div>
            </div>
            <span class="st-plate-edge st-plate-edge--top"></span>
            <span class="st-plate-edge st-plate-edge--bottom"></span>
            <span class="st-plate-edge st-plate-edge--left"></span>
            <span class="st-plate-edge st-plate-edge--right"></span>
        </div>
        <figcaption class="st-plate-caption">
            <span>
                上 <b>{{ top }}</b> · 下 <b>{{ bottom }}</b> · 左 <b>{{ left }}</b> · 右 <b>{{ right }}</b>
                <template v-if="gap !== null"> · 间距 <b>{{ gap }}</b></template>
            </span>
            <span>{{ caption }}</span>
        </figcaption>
    </figure>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import type { PlateEdge } from "./plateTypes";

const props = withDefaults(
    defineProps<{
        top: number;
        bottom: number;
        left: number;
        right: number;
        /** 图片间距；非瀑布流时传 null，只预览四向边距 */
        gap?: number | null;
        split?: boolean;
        direction?: "ltr" | "rtl";
        activeEdge?: PlateEdge;
    }>(),
    { gap: null, split: false, direction: "ltr", activeEdge: null }
);

/** 真实像素按手机屏宽折算成百分比，再放大一点便于观察 */
const toPercent = (value: number) => `${Math.min(14, Math.max(0, value) * 0.28).toFixed(2)}%`;

const isSpread = computed(() => props.split);
const sheetCount = computed(() => (props.split ? 2 : 1));

const plateStyle = computed(() => ({
    "--st-pt": toPercent(props.top),
    "--st-pb": toPercent(props.bottom),
    "--st-pl": toPercent(props.left),
    "--st-pr": toPercent(props.right),
    "--st-gap": props.gap === null ? "0%" : `${Math.min(8, Math.max(0, props.gap) * 0.22).toFixed(2)}%`
}));

const caption = computed(() => {
    if (!props.split) {
        return "单页试片";
    }
    return props.direction === "rtl" ? "双开页 · 从右到左" : "双开页 · 从左到右";
});
</script>

<style scoped>
.st-proof-plate {
    margin: 0;
    min-width: 0;
}
</style>
