<template>
    <div class="file-name-bar">{{ name }}</div>
</template>

<script setup lang="ts">
defineProps<{
    /** 当前阅读的文件名 */
    name: string;
}>();
</script>

<style scoped lang="scss">
.file-name-bar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    /* 贴在页码指示器上方，给它留出位置 */
    bottom: calc(48px + env(safe-area-inset-bottom, 0px));
    max-width: 80vw;
    padding: 2px 10px;
    border-radius: 999px;
    background-color: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 10;
}
</style>
