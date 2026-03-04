<template>
    <n-el tag="item" class="item p-1">
        <slot></slot>
    </n-el>
</template>
<script setup lang="ts">
import { useThemeVars } from "naive-ui";

const themeVars = useThemeVars();
</script>
<style lang="scss" scoped>
@keyframes hoverAnimation{
    from {
        background-size: 0% 100%;
    }
    to {
        background-size: 100% 100%;
    }
}
.item {
    display: block;
    cursor: pointer;
    background: linear-gradient(to right, var(--divider-color), var(--divider-color)) no-repeat;
    background-size: 0% 100%; /* 初始宽度为 0 */
    background-position: left; /* 从左边开始 */
    user-select: none;

    /* 平滑过渡 */
}
.item:hover {
    color: var(--primary-color-hover);
    background-size: 100% 100%; /* hover 时填满 */
    transition: background-size 0.3s ease;
}
.item:active {
    animation: hoverAnimation 0.3s ease;
}

</style>
