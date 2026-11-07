<template>
    <div
        class="page-loading"
        :class="{
            'is-static': !overlay,
            'is-slow': slow && !failed,
            'is-failed': failed
        }"
        @click="onClick"
    >
        <span class="page-loading__spinner"></span>
        <span class="page-loading__text">{{ text }}</span>
    </div>
</template>

<script lang="ts" setup>
/** 阅读页的图片占位层：转圈 + 文案，失败时变成可点击的「重试」入口 */
import { computed } from "vue";
import "@/views/reader/components/pageLoading.css";

const props = withDefaults(
    defineProps<{
        /** 网络偏慢，提示文案换成「网络较慢」 */
        slow?: boolean;
        /** 已经重试到头，显示失败态并允许点击重试 */
        failed?: boolean;
        /** 是否铺满父容器（false 时按普通块占位，供外层自己定位） */
        overlay?: boolean;
        /** 自定义文案，默认按状态自动选 */
        text?: string;
    }>(),
    { slow: false, failed: false, overlay: true, text: "" }
);

const emit = defineEmits<{
    retry: [];
}>();

const text = computed(() => {
    if (props.text) {
        return props.text;
    }
    if (props.failed) {
        return "加载失败 · 点击重试";
    }
    return props.slow ? "网络较慢，仍在加载…" : "加载中";
});

const onClick = () => {
    if (props.failed) {
        emit("retry");
    }
};
</script>
