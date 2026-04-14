<template>
    <n-flex vertical style="flex: 1; overflow: auto; scrollbar-width: none; gap: 1rem">
        <div ></div>
        <div class="up" ref="upTarget" style="height: 1px"></div>
        <div class="content">
            <FileItem v-for="item in viewStore.shelfFileList" :key="item.name" :item="item"></FileItem>
        </div>
        <div class="down" ref="bottomTarget" style="height: 1px"></div>
    </n-flex>
</template>
<script setup lang="ts">
import { useViewStore } from "@/stores/view";

import { useIntersectionObserver } from "@vueuse/core";
import { onMounted, ref, watch } from "vue";
import FileItem from "./FileItem.vue";

const viewStore = useViewStore();

const upTarget = ref<HTMLElement>();
const bottomTarget = ref<HTMLElement>();

const start = ref(0);
const end = ref(0);
const len = 5;
const upHeight = ref(0);
const downHeight = ref(0);



watch(
    () => viewStore.shelfFileList,
    () => {
        upHeight.value = 0;
        start.value = 0;
        end.value = start.value + 0;
        downHeight.value = 41 * (viewStore.shelfFileList.length - end.value - 1);
    }
);

const upUpdate = () => {};

const downUpdate = () => {};

onMounted(() => {
    const upStop = useIntersectionObserver(upTarget, ([entry], observerElement) => {
      console.log("upTarget",entry?.isIntersecting)
    }).stop;
    const bottomStop = useIntersectionObserver(bottomTarget, ([entry], observerElement) => {

        console.log("BottomTarget",entry?.isIntersecting)
    }).stop;
});
</script>
