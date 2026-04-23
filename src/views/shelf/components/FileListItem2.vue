<template>
    <div style="flex: 1" ref="parentRef">
        <!-- <div>123</div> -->
        <VirtualList ref="vListRef" :list-data="viewStore.shelfFileList" :containerHeight="containerHeight" :estimated-item-height="96" :key="key">
            <template #default="{ item }">
                <FileItem :item="item" class="mb-2" @click="toClick"></FileItem>
            </template>
        </VirtualList>
    </div>
</template>

<script setup lang="ts">
import VirtualList, { type VirtualListInstance } from "@/components/VirtualList.vue";
import { useViewStore } from "@/stores/view";
import { on } from "events";
import { onMounted, ref, watch, useTemplateRef, onActivated } from "vue";
import { nanoid } from "nanoid";
import FileItem from "./FileItem.vue";
import { useElementSize } from "@vueuse/core";
import { useMessage } from "naive-ui";
import { t } from "vue-router/dist/index-Cu9B0wDz.mjs";
import router from "@/router";

const viewStore = useViewStore();
const containerHeight = ref(<number>10);
const parentRef = ref<HTMLElement>();
const vListRef = useTemplateRef<VirtualListInstance>(null);

const msg = useMessage();

const key = ref(nanoid(8));

const init = () => {
    if (!parentRef.value) {
        return;
    }
    containerHeight.value = 10;
    setTimeout(() => {
        const div = parentRef.value;
        containerHeight.value = div.getBoundingClientRect().height;
        key.value = nanoid(8);
    }, 10);
};

const toClick = async (item: ViewFileType) => {
    if (item.isDir) {
        viewStore.shelfPath.push(item.name);
        viewStore.updateShelfFolder();
        return;
    }
    const list: ViewFileExtType[] = ["image", "zip"];
    if (list.includes(item.extType)) {
        const res = await viewStore.updateComicViewList(item);
        if (res.code != 200) {
            msg.error(res.msg);
            return;
        }
        router.push({ path: "/reader" });
        return;
    }
    msg.warning("暂不支持读取此文件");
};

watch(
    () => viewStore.shelfFileList,
    () => {
        init();
    }
);

watch(
    () => viewStore.shelfJumpName,
    (name) => {
        if (!name) {
            return;
        }
        setTimeout(() => {
            vListRef.value.scrollToIndex(viewStore.getShelfJump());
        }, 1000);
    }
);

onMounted(() => {
    init();
    const { width, height } = useElementSize(parentRef);
    watch(
        () => [width.value, height.value],
        ([newWidth, newHeight]) => {
            init();
        }
    );
});
</script>
