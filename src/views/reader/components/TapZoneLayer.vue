<template>
    <div
        ref="rootRef"
        class="tap-zone-layer"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
    >
        <template v-if="debug">
            <div
                v-for="zone in zones"
                :key="zone.id"
                class="tap-zone-debug"
                :style="rectStyle(zone)"
            >
                <span>{{ zone.action }}</span>
            </div>
        </template>
    </div>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import type { TapZone } from "@/views/reader/tapZones/types";

const props = withDefaults(
    defineProps<{
        zones: TapZone[];
        /** 调试时显示区域边框 */
        debug?: boolean;
        /** 图片比视口大时，允许拖动（此时拖动不再算滑动翻页） */
        pannable?: boolean;
    }>(),
    { debug: false, pannable: false }
);

const emit = defineEmits<{
    action: [zone: TapZone];
    swipe: [direction: "left" | "right"];
    pan: [delta: { dx: number; dy: number }];
}>();

/** 位移小于该值算点击 */
const TAP_MOVE = 10;
/** 位移大于该值算滑动 */
const SWIPE_MIN = 50;

const rootRef = ref<HTMLElement>();

let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let pointerId = -1;
let panning = false;

const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) {
        return;
    }
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastY = e.clientY;
    panning = false;
    pointerId = e.pointerId;
    rootRef.value?.setPointerCapture?.(e.pointerId);
};

const onPointerMove = (e: PointerEvent) => {
    if (!props.pannable || pointerId !== e.pointerId) {
        return;
    }
    if (!panning) {
        // 超过点击容差才开始平移，第一帧只切换状态，避免画面跳一下
        if (Math.abs(e.clientX - startX) < TAP_MOVE && Math.abs(e.clientY - startY) < TAP_MOVE) {
            return;
        }
        panning = true;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
    }
    emit("pan", { dx: e.clientX - lastX, dy: e.clientY - lastY });
    lastX = e.clientX;
    lastY = e.clientY;
};

const onPointerUp = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) {
        return;
    }
    pointerId = -1;
    if (panning) {
        // 这一下手势是拖动，不再触发点击或滑动翻页
        panning = false;
        return;
    }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) < TAP_MOVE && Math.abs(dy) < TAP_MOVE) {
        hitTest(e.clientX, e.clientY);
        return;
    }
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        emit("swipe", dx < 0 ? "left" : "right");
    }
};

const onPointerCancel = () => {
    pointerId = -1;
    panning = false;
};

/** 从后往前找命中的区域，后添加的覆盖先添加的 */
const hitTest = (clientX: number, clientY: number) => {
    const el = rootRef.value;
    if (!el) {
        return;
    }
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
        return;
    }
    const x = (clientX - box.left) / box.width;
    const y = (clientY - box.top) / box.height;

    for (let i = props.zones.length - 1; i >= 0; i--) {
        const zone = props.zones[i]!;
        const { rect } = zone;
        if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
            emit("action", zone);
            return;
        }
    }
};

const rectStyle = (zone: TapZone) => ({
    left: `${zone.rect.x * 100}%`,
    top: `${zone.rect.y * 100}%`,
    width: `${zone.rect.width * 100}%`,
    height: `${zone.rect.height * 100}%`
});
</script>

<style lang="scss" scoped>
.tap-zone-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    // 允许双指缩放，单指手势交给 pointer 事件，避免浏览器吞掉点击
    touch-action: pinch-zoom;
    user-select: none;
    -webkit-user-select: none;
}

.tap-zone-debug {
    position: absolute;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    padding: 2px 4px;
    font-size: 11px;
    color: #fff;
    background-color: rgba(64, 158, 255, 0.18);
    border: 1px dashed rgba(64, 158, 255, 0.9);
    pointer-events: none;
}
</style>
