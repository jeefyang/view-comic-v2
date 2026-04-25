<template>
    <div
        class="main"
        ref="mainRef"
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
        dragOutside
        v-touch:drag="(e) => handleSelect('drag', e)"
        @dblclick="(e) => handleSelect('dblclick', e)"
    >
        <slot></slot>
    </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

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

const emits = defineEmits(["swipe", "swipe.left", "swipe.right", "swipe.top", "swipe.bottom", "update:x", "update:y", "longtap", "tap", "dblclick", "longPress"]);

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

let clientX: number | undefined = undefined;
let clientY: number | undefined = undefined;
const handleSelect = (v: string, e?: any) => {
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
        emits("tap", e);
    } else if (v == "dblclick") {
        emits("dblclick", e);
    } else if (v == "drag") {
    }
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
        setNoOpacity();
        isScale.value = false;
        document.body.removeEventListener("mousemove", moveFn);
        document.body.removeEventListener("touchmove", moveFn);
        document.body.removeEventListener("mouseup", endFn);
        document.body.removeEventListener("touchend", endFn);
    };
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
        console.log("longPress");
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

onMounted(() => {
    watch(
        () => [modelX.value, modelY.value],
        ([x, y]) => {
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
});
</script>
<style scoped>
.main {
    position: fixed;
    display: flex;
}
</style>
