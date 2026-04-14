<template>
    <div ref="parentRef" class="container">
        <div :style="{ height: `${virtualizer.getTotalSize()}px` }" />
        <div v-for="virtualRow in virtualizer.getVirtualItems()" :key="virtualRow.key.toString()" :ref="(el) => measureElementRef(el)" class="item" :style="{ transform: `translateY(${virtualRow.start}px)` }">
            <slot name="box" :index="virtualRow.index"></slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";

const parentRef = ref(null);
const props = defineProps({
    list: {
        type: Array,
        default: () => []
    },
    height: {
        type: Number,
        default: 50
    }
});

const virtualizer = useVirtualizer({
    count: props.list.length, // 监听数组长度
    getScrollElement: () => parentRef.value,
    estimateSize: () => props.height
});

// 创建包装函数以处理类型兼容性问题
const measureElementRef = (el: any) => {
    // 只有当 el 是原生 DOM 元素时才调用 measureElement
    if (el && el instanceof HTMLElement) {
        //@ts-expect-error
        virtualizer.measureElement(el);
    }
};
</script>
