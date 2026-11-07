<!-- 阅读器底部页码指示器：第 N 页 / 共 M 页，点击可跳转 -->
<template>
    <div
        class="page-indicator"
        v-if="total > 0"
        role="button"
        tabindex="0"
        :aria-label="`第 ${current + 1} 页，共 ${total} 页，点击跳转`"
        @keydown.enter.prevent="onKeydown"
        @keydown.space.prevent="onKeydown"
    >
        <span class="page-indicator__text">第 {{ current + 1 }} 页 / 共 {{ total }} 页</span>
    </div>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        /** 0 基当前页 */
        current: number;
        /** 总页数 */
        total: number;
    }>(),
    {
        current: 0,
        total: 0
    }
);

/** 键盘可达：div 上的 Enter / 空格不会自动触发 click，手动补上 */
const onKeydown = (e: KeyboardEvent) => {
    (e.currentTarget as HTMLElement).click();
};
</script>

<style scoped>
.page-indicator {
    position: fixed;
    left: 50%;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 13px;
    line-height: 1.4;
    white-space: nowrap;
    letter-spacing: 1px;
    user-select: none;
    z-index: 10;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s ease, background-color 0.15s ease;
}

.page-indicator:hover {
    background: rgba(0, 0, 0, 0.72);
}

.page-indicator:active {
    transform: translateX(-50%) scale(0.96);
}

.page-indicator:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.75);
    outline-offset: 2px;
}
</style>
