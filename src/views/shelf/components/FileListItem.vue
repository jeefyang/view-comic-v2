<template>
    <n-flex vertical style="flex: 1; overflow: auto; scrollbar-width: none; gap: 1rem">
        <div class="up" ref="upTarget" style="height: 10px"></div>
        <n-card v-for="item in viewStore.shelfFileList" content-style="padding: 0.5rem;">
            <n-flex align="center" style="height: 100%">
                <n-flex align="center" justify="center" style="width: 5rem; height: 5rem">
                    <n-icon v-if="item.isDir" :color="themeVars.warningColor" size="40">
                        <FolderFilled />
                    </n-icon>
                    <n-icon v-else :color="themeVars.infoColor" size="40">
                        <FileCopyRound />
                    </n-icon>
                </n-flex>

                <n-flex vertical style="flex: 1">
                    <n-flex>{{ item.name }}</n-flex>
                    <n-flex justify="space-between">
                        <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">大小:{{ item.sizeStr }}</div>
                        <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">创建:{{ item.createTime }}</div>
                    </n-flex>
                    <n-flex justify="end">
                        <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">修改:{{ item.updateTime }}</div>
                    </n-flex>
                </n-flex>
            </n-flex>
        </n-card>
        <div class="down" ref="downTarget"></div>
    </n-flex>
</template>
<script setup lang="ts">
import { useViewStore } from "@/stores/view";
import { useThemeVars } from "naive-ui";
import { FolderFilled, FileCopyRound } from "@vicons/material";
import { useIntersectionObserver } from "@vueuse/core";
import { onMounted, ref, watch } from "vue";

const viewStore = useViewStore();
const themeVars = useThemeVars();

const upTarget = ref<HTMLElement>();
const BottomTarget = ref<HTMLElement>();

const start = ref(0);
const end = ref(0);
const len = 5;
const upHeight = ref(0);
const downHeight = ref(0);

watch(()=>viewStore.shelfFileList,()=>{
    upHeight.value=0
    start.value=0
    end.value=start.value+0
    downHeight.value=41*(viewStore.shelfFileList.length-end.value-1)

})

const upUpdate=()=>{

}

const downUpdate=()=>{

}

onMounted(() => {
    const upStop = useIntersectionObserver(upTarget, ([entry], observerElement) => {
      if(start.value>0){
        // start.value+=
      }
    }).stop;
    const bottomStop = useIntersectionObserver(BottomTarget, ([entry], observerElement) => {}).stop;
});
</script>
