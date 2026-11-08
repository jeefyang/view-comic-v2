<template>
    <teleport to="body">
        <transition name="float-actions">
            <div v-if="show" class="float-actions-root">
                <div class="float-actions-backdrop" @pointerdown="onBackdropPress" @click="onBackdropPress" />
                <div ref="menuRef" class="float-actions" :style="menuStyle">
                    <n-button
                        v-for="item in items"
                        :key="item.key"
                        class="float-action"
                        size="small"
                        round
                        secondary
                        @click="onClick(item.key)"
                    >
                        {{ floatActionLabel(item.key, bookmarked) }}
                    </n-button>
                </div>
            </div>
        </transition>
    </teleport>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { floatActions, floatActionLabel, type FloatActionKey } from "./floatActions";

const props = defineProps<{
    show: boolean;
    /** 跟随的锚点元素（悬浮按钮的根节点） */
    anchor?: HTMLElement | null;
    /** 当前页是否已有书签，决定菜单里显示「添加书签」还是「取消书签」 */
    bookmarked?: boolean;
}>();

const emit = defineEmits<{
    "update:show": [show: boolean];
    action: [key: FloatActionKey];
}>();

const items = floatActions;
const menuRef = ref<HTMLElement>();

/** 菜单与按钮之间的间距 */
const GAP = 8;
/** 菜单距视口边缘的最小留白 */
const PAD = 8;

const pos = reactive({ left: 0, top: 0, openUp: false, alignLeft: true, ready: false });

const menuStyle = computed(() => ({
    left: `${pos.left}px`,
    top: `${pos.top}px`,
    alignItems: pos.alignLeft ? "flex-start" : "flex-end",
    transformOrigin: `${pos.openUp ? "bottom" : "top"} ${pos.alignLeft ? "left" : "right"}`,
    opacity: pos.ready ? 1 : 0
}));

/** 按按钮的实际位置挑一个放得下的方向：下/上、左/右，最后夹进视口 */
const place = () => {
    const menu = menuRef.value;
    if (!menu) {
        return;
    }
    const menuW = menu.offsetWidth || 120;
    const menuH = menu.offsetHeight || 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const anchor = props.anchor;
    const box = anchor ? anchor.getBoundingClientRect() : undefined;
    if (!box || box.width === 0 || box.height === 0) {
        // 拿不到按钮的真实位置时退到右下角，保证菜单至少能看见、能点
        pos.left = Math.max(PAD, vw - menuW - PAD);
        pos.top = Math.max(PAD, vh - menuH - PAD - 72);
        pos.openUp = false;
        pos.alignLeft = false;
        pos.ready = true;
        return;
    }

    const spaceAbove = box.top - PAD;
    const spaceBelow = vh - box.bottom - PAD;
    const need = menuH + GAP;
    // 下方放得下就往下展开；否则上方放得下就往上；两边都不够时选空间大的一侧
    const openUp = spaceBelow < need && (spaceAbove >= need || spaceAbove > spaceBelow);

    const spaceRight = vw - box.left - PAD;
    const spaceLeft = box.right - PAD;
    const needW = menuW + GAP;
    // 右侧放得下就以按钮左边为基准向右长；否则左侧放得下就以按钮右边为基准向左长；都不够选空间大的一侧
    const alignLeft = spaceRight >= needW || (spaceLeft < needW && spaceRight >= spaceLeft);

    let left = alignLeft ? box.left : box.right - menuW;
    let top = openUp ? box.top - GAP - menuH : box.bottom + GAP;

    left = Math.min(Math.max(PAD, left), Math.max(PAD, vw - menuW - PAD));
    top = Math.min(Math.max(PAD, top), Math.max(PAD, vh - menuH - PAD));

    pos.left = Math.round(left);
    pos.top = Math.round(top);
    pos.openUp = openUp;
    pos.alignLeft = alignLeft;
    pos.ready = true;
};

const onResize = () => place();

/**
 * 打开时刻：触摸点击在 touchend 之后还会补一个合成 click，
 * 那个 click 会落在刚挂上来的背板上，必须挡掉，否则菜单会「一闪就消失」。
 */
let openedAt = 0;
const OPEN_GUARD = 400;

const onBackdropPress = () => {
    if (Date.now() - openedAt < OPEN_GUARD) {
        return;
    }
    close();
};

watch(
    () => [props.show, props.anchor] as const,
    async ([value]) => {
        if (!value) {
            pos.ready = false;
            window.removeEventListener("resize", onResize);
            return;
        }
        openedAt = Date.now();
        await nextTick();
        place();
        // 首帧字体/圆角可能还没撑开尺寸；锚点也可能晚一帧才有，多补几次
        requestAnimationFrame(() => place());
        setTimeout(place, 60);
        window.removeEventListener("resize", onResize);
        window.addEventListener("resize", onResize);
    }
);

onBeforeUnmount(() => {
    window.removeEventListener("resize", onResize);
});

const close = () => {
    emit("update:show", false);
};

const onClick = (key: FloatActionKey) => {
    emit("action", key);
    close();
};
</script>

<style lang="scss" scoped>
.float-actions-root {
    position: fixed;
    inset: 0;
    z-index: 999;
}

.float-actions-backdrop {
    position: absolute;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.12);
}

.float-actions {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 16px);
    overflow: auto;
}

.float-action {
    min-width: 96px;
    font-size: 13px;
}

.float-actions-enter-active,
.float-actions-leave-active {
    transition: opacity 0.18s ease;
}

.float-actions-enter-from,
.float-actions-leave-to {
    opacity: 0;
}
</style>
