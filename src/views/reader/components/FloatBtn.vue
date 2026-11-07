<template>
    <div
        class="main"
        ref="mainRef"
        :class="{ 'is-dragging': dragging }"
        :style="{
            opacity: curOpacity,
            top: !props.isBottom ? realY + 'px' : undefined,
            left: !props.isRight ? realX + 'px' : undefined,
            bottom: props.isBottom ? realY + 'px' : undefined,
            right: props.isRight ? realX + 'px' : undefined,
            scale: curScale
        }"
        v-touch:swipe.left="(e) => handleSelect('left', e)"
        v-touch:swipe.right="(e) => handleSelect('right', e)"
        v-touch:swipe.top="(e) => handleSelect('top', e)"
        v-touch:swipe.bottom="(e) => handleSelect('bottom', e)"
        v-touch:longtap="(e) => handleSelect('longtap', e)"
        v-touch:press="(e) => handleSelect('press', e)"
        v-touch:tap="(e) => handleSelect('tap', e)"
        v-touch:drag="(e) => handleSelect('drag', e)"
        @dblclick="(e) => handleSelect('dblclick', e)"
        @touchstart.passive="onPressStart"
        @touchmove.passive="onPressMove"
        @mousedown="onPressStart"
        @mousemove="onPressMove"
        dragOutside
    >
        <slot></slot>
    </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps({
    opacity: {
        type: Number,
        default: 0.5
    },
    scale: {
        type: Number,
        default: 1.5
    },
    x: {
        type: Number,
        default: 0
    },
    isBottom: {
        type: Boolean,
        default: false
    },
    isRight: {
        type: Boolean,
        default: false
    },
    y: {
        type: Number,
        default: 0
    },
    isCoustomLongPress: {
        type: Boolean,
        default: false
    },
    /** 左吸附,undefined为不吸附 */
    adsorbLeft: {
        type: Number,
        default: 0
    },
    /** 上吸附,undefined为不吸附 */
    adsorbTop: {
        type: Number,
        default: 0
    },
    /** 右吸附,undefined为不吸附 */
    adsorbRight: {
        type: Number,
        default: 0
    },
    /** 下吸附,undefined为不吸附 */
    adsorbBottom: {
        type: Number,
        default: 0
    },
    /** 是否启用吸附 */
    isAdsorb: {
        type: Boolean,
        default: true
    },
    /** 强制吸附 */
    forceAdsorb: {
        type: Boolean,
        default: false
    },
    /** 吸附时边距 */
    adsorbPadding: {
        type: Number,
        default: 10
    },
    /** 吸附距离 */
    adsorbDistance: {
        type: Number,
        default: 60
    },
    /**
     * 左右贴边停靠：松手后按钮自动吸到离得最近的一侧，
     * 并露出 `dockHidden` 比例的一半在屏幕外，尽量不压住正文。
     */
    dockSide: {
        type: Boolean,
        default: false
    },
    /** 停靠后留在屏幕外的宽度占按钮宽度的比例（0=完全露出，0.5=露一半） */
    dockHidden: {
        type: Number,
        default: 0.5
    }
});

const isScale = ref(false);
const isOpacity = ref(true);

const mainRef = ref<HTMLElement>();
let divRect: { width: number; height: number } = undefined;

const curOpacity = computed(() => {
    return isOpacity.value ? props.opacity : 1;
});

const curScale = computed(() => {
    return isScale.value ? props.scale : 1;
});

const emits = defineEmits(["swipe", "swipe.left", "swipe.right", "swipe.top", "swipe.bottom", "update:x", "update:y", "longtap", "tap", "dblclick", "longPress", "handle"]);

const modelX = computed({
    get() {
        return props.x;
    },
    set(v: number) {
        emits("update:x", v);
    }
});

const modelY = computed({
    get() {
        return props.y;
    },
    set(v: number) {
        emits("update:y", v);
    }
});

const realX = ref(0);
const realY = ref(0);

/** 正在拖动：拖动过程中不做贴边停靠，免得和手指抢位置 */
const dragging = ref(false);

let clientX: number | undefined = undefined;
let clientY: number | undefined = undefined;
/** 本次按下时的坐标，用来区分「点击」和「拖动」 */
let pressX = 0;
let pressY = 0;
/** 本次按下以来手指/鼠标是否移动超过阈值 */
let movedFar = false;
const MOVE_TOLERANCE = 10;

const onPressStart = (e: MouseEvent | TouchEvent) => {
    const point = "touches" in e ? e.touches[0] : e;
    if (!point) {
        return;
    }
    pressX = point.clientX;
    pressY = point.clientY;
    movedFar = false;
};

const onPressMove = (e: MouseEvent | TouchEvent) => {
    const point = "touches" in e ? e.touches[0] : e;
    if (!point || movedFar) {
        return;
    }
    if (Math.abs(point.clientX - pressX) > MOVE_TOLERANCE || Math.abs(point.clientY - pressY) > MOVE_TOLERANCE) {
        movedFar = true;
    }
};

const handleSelect = (v: string, e?: any) => {
    if (v == "drag") {
        // 拖动本身不再往上抛事件
        return;
    }
    if (longPressTimer) {
        clearTimeout(longPressTimer);
    }
    setNoOpacity();
    if (v == "left") {
        emits("swipe.left", e);
    } else if (v == "right") {
        emits("swipe.right", e);
    } else if (v == "top") {
        emits("swipe.top", e);
    } else if (v == "bottom") {
        emits("swipe.bottom", e);
    } else if (v == "press") {
        setLongPress(e);
    } else if (v == "longtap") {
        emits("longtap", e);
    } else if (v == "tap") {
        // 真的拖动过（位移超过阈值）就不算点击，避免拖动松手误触
        if (movedFar) {
            movedFar = false;
            return;
        }
        emits("tap", e);
    } else if (v == "dblclick") {
        emits("dblclick", e);
    }
    emits("handle", v, e);
};

let noPacityTimer: any;
let noPacityTime = 2000;

const setNoOpacity = (isNoTime: boolean = false) => {
    isOpacity.value = false;
    if (noPacityTimer) {
        clearTimeout(noPacityTimer);
    }
    if (isNoTime) {
        return;
    }
    noPacityTimer = setTimeout(() => {
        isOpacity.value = true;
    }, noPacityTime);
};

let longPressTimer: any;
let longPressTime = 500;

const setMove = () => {
    const moveFn = (e: MouseEvent | TouchEvent) => {
        let x = -1;
        let y = -1;
        if (e instanceof TouchEvent) {
            x = e.touches[0].clientX;
            y = e.touches[0].clientY;
        } else {
            x = e.clientX;
            y = e.clientY;
        }

        if (clientX == undefined || clientY == undefined) {
            clientX = x;
            clientY = y;
            return;
        }
        modelX.value += (x - clientX) * (props.isRight ? -1 : 1);
        modelY.value += (y - clientY) * (props.isBottom ? -1 : 1);
        clientX = x;
        clientY = y;
    };
    const endFn = (e: MouseEvent | TouchEvent) => {
        clientX = undefined;
        clientY = undefined;
        dragging.value = false;
        setNoOpacity();
        isScale.value = false;
        document.body.removeEventListener("mousemove", moveFn);
        document.body.removeEventListener("touchmove", moveFn);
        document.body.removeEventListener("mouseup", endFn);
        document.body.removeEventListener("touchend", endFn);
        // 松手后贴到最近的一侧
        if (props.dockSide) {
            applyDock(modelX.value, modelY.value);
        }
    };
    dragging.value = true;
    document.body.addEventListener("mousemove", moveFn);
    document.body.addEventListener("mouseup", endFn);
    document.body.addEventListener("touchmove", moveFn);
    document.body.addEventListener("touchend", endFn);
};

const setLongPress = (e: any) => {
    longPressTimer = setTimeout(() => {
        if (props.isCoustomLongPress) {
            emits("longPress", e);
            return;
        }
        if (!mainRef.value) {
            return;
        }
        const div = mainRef.value;
        divRect = div.getBoundingClientRect();
        isScale.value = true;
        setNoOpacity(true);
        setMove();
        return;
    }, longPressTime);
};

const updateRealX = (v: number) => {
    if (divRect == undefined) {
        divRect = mainRef?.value?.getBoundingClientRect?.() || { width: 0, height: 0 };
    }
    if (!props.isAdsorb) {
        realX.value = v;
        return;
    }
    if (props.adsorbLeft == undefined && props.adsorbRight == undefined) {
        realX.value = v;
        return;
    }
    // 转为中心点
    let centerX = v + divRect.width / 2;
    // 转为左上角
    if (props.isRight) {
        centerX = window.innerWidth - centerX;
    }
    const list = [
        props.adsorbLeft == undefined ? undefined : Math.abs(centerX - props.adsorbPadding),
        props.adsorbRight == undefined ? undefined : Math.abs(window.innerWidth - centerX - props.adsorbPadding)
    ];
    // 左边
    if (list[0] != undefined && (list[1] == undefined || list[0] <= list[1])) {
        if (props.forceAdsorb || list[0] <= props.adsorbDistance + divRect.width / 2 + props.adsorbPadding) {
            centerX = props.adsorbPadding + divRect.width / 2 + props.adsorbLeft;
        }
    }
    // 右边
    else if (list[1] != undefined && (list[0] == undefined || list[1] < list[0])) {
        if (props.forceAdsorb || list[1] <= props.adsorbDistance + divRect.width / 2 + props.adsorbPadding) {
            centerX = window.innerWidth - props.adsorbPadding - divRect.width / 2 - props.adsorbRight;
        }
    }
    //恢复坐标位置
    if (props.isRight) {
        realX.value = window.innerWidth - centerX - divRect.width / 2;
    } else {
        realX.value = centerX - divRect.width / 2;
    }
};

const updateRealY = (v: number) => {
    if (!props.isAdsorb) {
        realY.value = v;
        return;
    }
    if (props.adsorbBottom == undefined && props.adsorbTop == undefined) {
        realY.value = v;
        return;
    }
    // 转为中心点
    let centerY = v + divRect.height / 2;
    // 转为左上角
    if (props.isBottom) {
        centerY = window.innerHeight - centerY;
    }
    const list = [
        props.adsorbTop == undefined ? undefined : Math.abs(centerY - props.adsorbPadding),
        props.adsorbBottom == undefined ? undefined : Math.abs(window.innerHeight - centerY - props.adsorbPadding)
    ];
    // 上边
    if (list[0] != undefined && (list[1] == undefined || list[0] <= list[1])) {
        if (props.forceAdsorb || list[0] <= props.adsorbDistance + divRect.height / 2 + props.adsorbPadding) {
            centerY = props.adsorbPadding + divRect.height / 2 + props.adsorbTop;
        }
    }
    // 下边
    else if (list[1] != undefined && (list[0] == undefined || list[1] < list[0])) {
        if (props.forceAdsorb || list[1] <= props.adsorbDistance + divRect.height / 2 + props.adsorbPadding) {
            centerY = window.innerHeight - props.adsorbPadding - divRect.height / 2 - props.adsorbBottom;
        }
    }

    //恢复坐标位置
    if (props.isBottom) {
        realY.value = window.innerHeight - centerY - divRect.height / 2;
    } else {
        realY.value = centerY - divRect.height / 2;
    }
};

/** 量当前按钮实际尺寸（拖过之后尺寸一般不变，但半隐藏时会变，所以每次现量） */
const measure = () => {
    const rect = mainRef.value?.getBoundingClientRect?.();
    return rect ? { width: rect.width, height: rect.height } : { width: 0, height: 0 };
};

/** 对外坐标（可能是「距右 / 距下」）→ 屏幕左上角 */
const toScreen = (vx: number, vy: number, width: number, height: number) => ({
    left: props.isRight ? window.innerWidth - vx - width : vx,
    top: props.isBottom ? window.innerHeight - vy - height : vy
});

/** 屏幕左上角 → 对外坐标 */
const toProp = (left: number, top: number, width: number, height: number) => ({
    x: props.isRight ? window.innerWidth - left - width : left,
    y: props.isBottom ? window.innerHeight - top - height : top
});

const clampTop = (top: number, height: number) =>
    Math.min(Math.max(top, props.adsorbPadding), Math.max(props.adsorbPadding, window.innerHeight - height - props.adsorbPadding));

/** 拖动过程中：只在视口内夹一下，不贴边，避免和手指抢位置 */
const applyClamp = (vx: number, vy: number) => {
    const { width, height } = measure();
    if (!width || !height) {
        realX.value = vx;
        realY.value = vy;
        return;
    }
    const { left, top } = toScreen(vx, vy, width, height);
    const clampedLeft = Math.min(
        Math.max(left, props.adsorbPadding),
        Math.max(props.adsorbPadding, window.innerWidth - width - props.adsorbPadding)
    );
    const prop = toProp(clampedLeft, clampTop(top, height), width, height);
    realX.value = prop.x;
    realY.value = prop.y;
};

/**
 * 停靠：吸到离得最近的一侧，并按 dockHidden 把一部分藏到屏幕外。
 * 上半部分按 dockHidden=0.5 时只露一半，点露出来的那半仍然能亮起菜单。
 */
const applyDock = (vx: number, vy: number) => {
    const { width, height } = measure();
    if (!width || !height) {
        realX.value = vx;
        realY.value = vy;
        return;
    }
    const { left, top } = toScreen(vx, vy, width, height);
    const edge = left + width / 2 < window.innerWidth / 2 ? "left" : "right";
    const hidden = Math.min(Math.max(props.dockHidden, 0), 1);
    const dockedLeft = edge === "left" ? -width * hidden : window.innerWidth - width * (1 - hidden);
    const prop = toProp(dockedLeft, clampTop(top, height), width, height);
    realX.value = prop.x;
    realY.value = prop.y;
    // 把停靠后的位置同步回 v-model，否则下次拖动会从旧位置「跳」回来
    if (Math.abs(modelX.value - prop.x) > 0.5) {
        modelX.value = prop.x;
    }
    if (Math.abs(modelY.value - prop.y) > 0.5) {
        modelY.value = prop.y;
    }
};

const onWindowResize = () => {
    if (!props.dockSide) {
        return;
    }
    applyDock(modelX.value, modelY.value);
};

onMounted(() => {
    watch(
        () => [modelX.value, modelY.value],
        ([x, y]) => {
            if (props.dockSide) {
                if (dragging.value) {
                    applyClamp(x, y);
                } else {
                    applyDock(x, y);
                }
                return;
            }
            updateRealX(x);
            updateRealY(y);
            if (props.isAdsorb) {
                if (props.forceAdsorb) {
                    const deltaX = Math.abs(x - realX.value);
                    const deltaY = Math.abs(y - realY.value);
                    if (deltaX > deltaY) {
                        realX.value = Math.max(props.adsorbPadding, Math.min(window.innerWidth - props.adsorbPadding - (divRect?.width || 0), x));
                    } else {
                        realY.value = Math.max(props.adsorbPadding, Math.min(window.innerHeight - props.adsorbPadding - (divRect?.height || 0), y));
                    }
                } else {
                    realX.value = Math.max(props.adsorbPadding, Math.min(window.innerWidth - props.adsorbPadding - (divRect?.width || 0), realX.value));
                    realY.value = Math.max(props.adsorbPadding, Math.min(window.innerHeight - props.adsorbPadding - (divRect?.height || 0), realY.value));
                }
            }
        },
        { immediate: true }
    );
    // 横竖屏切换 / 窗口拉伸后重新贴边，否则按钮可能留在屏幕外
    window.addEventListener("resize", onWindowResize);
});

onBeforeUnmount(() => {
    window.removeEventListener("resize", onWindowResize);
    if (noPacityTimer) {
        clearTimeout(noPacityTimer);
    }
    if (longPressTimer) {
        clearTimeout(longPressTimer);
    }
});

// 供外部（展开菜单）取按钮的实际位置做定位锚点
defineExpose({ el: mainRef });
</script>
<style scoped>
.main {
    position: fixed;
    display: flex;
    /* 拖动悬浮按钮时不要触发页面滚动 / 浏览器手势 */
    touch-action: none;
    z-index: 10;
    /* 贴边停靠时滑过去，别硬跳 */
    transition: left 0.22s ease, right 0.22s ease, top 0.22s ease, bottom 0.22s ease;
}

/* 拖动中跟随手指，过渡会拖慢手感 */
.main.is-dragging {
    transition: none;
}
</style>
