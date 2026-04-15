<template>
    <div style="flex: 1; overflow: auto; scrollbar-width: none" ref="parentRef" @scroll="onScroll">
        <!-- 列表 -->
        <div>
            <div class="up" ref="upTarget" style="height: 1px"></div>
            <div class="content">
                <div v-for="(item, index) in viewStore.shelfFileList" :key="item.name" :ref="(el) => toChildRef(el, index)">
                    <FileItem :item="item"></FileItem>
                </div>
            </div>
            <div class="down" ref="bottomTarget" style="height: 1px"></div>
        </div>
    </div>
</template>
<script setup lang="ts">
import { useViewStore } from "@/stores/view";

import { useIntersectionObserver } from "@vueuse/core";
import { onMounted, ref, watch } from "vue";
import FileItem from "./FileItem.vue";

const viewStore = useViewStore();

const upTarget = ref<HTMLElement>();
const bottomTarget = ref<HTMLElement>();

const parentRef = ref<HTMLElement>();

const start = ref(0);

const upHeight = ref(0);
const downHeight = ref(0);
const itemHeightList=ref(<{[x in number]:number}>{})

watch(
    () => viewStore.shelfFileList,
    () => {
      
    }
);

const upUpdate = () => {};

const downUpdate = () => {};

const onScroll = (e: any) => {
    console.log(e);
};

const toChildRef = (el: any, index: number) => {
    // const div = <HTMLDivElement>el;
    // if (!div) {
    //     return;
    // }
    // const target = new IntersectionObserver((entries) => {
    //     const e = entries[0];
    //     console.log(e?.boundingClientRect.height);
    // });
    // target.observe(div);
};

const parentW = ref(0);
const parentH = ref(0);
const scrollY=ref(0)

const init = () => {
    if (!parentRef.value) {
        return;
    }
    const div = parentRef.value;
    parentH.value = div.getBoundingClientRect().height;
    parentW.value = div.getBoundingClientRect().width;
    console.log(parentH.value, parentW.value);
    setTimeout(() => {
        div.scrollTop = 1000;
    }, 2000);
};

onMounted(() => {
    init();
    // const upStop = useIntersectionObserver(upTarget, ([entry], observerElement) => {
    //     console.log("upTarget", entry?.isIntersecting);
    // }).stop;
    // const bottomStop = useIntersectionObserver(bottomTarget, ([entry], observerElement) => {
    //     console.log("BottomTarget", entry?.isIntersecting);
    // }).stop;
});
</script>
