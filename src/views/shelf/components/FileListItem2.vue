<template>
    <div style="flex: 1" ref="parentRef">
        <VirtualList ref="vListRef" :list-data="viewStore.shelfFileList" :containerHeight="containerHeight" :estimated-item-height="96">
            <template #default="{ item }">
                <FileItem :item="item" class="mb-2" @click="toClick"></FileItem>
            </template>
        </VirtualList>
    </div>
</template>

<script setup lang="ts">
import VirtualList, { type VirtualListInstance } from "@/components/VirtualList.vue";
import { useViewStore } from "@/stores/view";
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useTemplateRef, watch } from "vue";
import FileItem from "./FileItem.vue";
import { useElementSize } from "@vueuse/core";
import { useMessage } from "naive-ui";
import router from "@/router";

const viewStore = useViewStore();
const containerHeight = ref(<number>10);
const parentRef = ref<HTMLElement>();
const vListRef = useTemplateRef<VirtualListInstance>(null);

const msg = useMessage();

/**
 * 每个目录记一份滚动位置：{ 第一个可见项的名字, 项内偏移 }。
 * 只放在内存里 —— 目录重新加载后下标可能变，用名字定位更稳。
 */
const scrollMemo = new Map<string, { name: string; offset: number }>();
const pathKey = (path = viewStore.shelfPath) => path.join("/");

/** 把当前滚动位置记到某个路径下（key 省略时用当前路径） */
const snapshot = (key = pathKey()) => {
    const state = vListRef.value?.getScrollState();
    if (!state) {
        return;
    }
    const item = viewStore.shelfFileList[state.index];
    if (!item) {
        return;
    }
    scrollMemo.set(key, { name: item.name, offset: state.offset });
};

/** 滚到列表顶部：给书架右下角的快捷按钮用 */
const scrollToTop = async () => {
    await vListRef.value?.scrollToIndex(0);
};

/** 滚到列表末尾（最后一项目标） */
const scrollToBottom = async () => {
    const last = viewStore.shelfFileList.length - 1;
    if (last < 0) {
        return;
    }
    await vListRef.value?.scrollToIndex(last);
};

defineExpose({ scrollToTop, scrollToBottom, snapshot });

/** 回到某个路径时恢复滚动位置（找不到同名条目就留在顶部） */
const restore = async (key = pathKey()) => {
    const memo = scrollMemo.get(key);
    if (!memo) {
        return;
    }
    const index = viewStore.shelfFileList.findIndex((item) => item.name === memo.name);
    if (index < 0) {
        return;
    }
    await nextTick();
    await vListRef.value?.restorePosition(index, memo.offset);
};

// 容器尺寸变了只改高度，不再重建列表（重建必然丢滚动位置）
const { height } = useElementSize(parentRef);
watch(
    height,
    (value) => {
        if (value > 0) {
            containerHeight.value = value;
        }
    },
    { immediate: true }
);

// 换目录：用 sync 抢在 updateShelfFolder 清空列表之前把位置记下来
watch(
    () => pathKey(),
    (_next, prev) => {
        if (prev !== undefined) {
            snapshot(prev);
        }
    },
    { flush: "sync" }
);

// 新列表就位后恢复滚动位置
watch(
    () => viewStore.shelfFileList,
    () => {
        void restore();
    },
    { flush: "post" }
);

const toClick = async (item: ViewFileType) => {
    if (item.isDir) {
        snapshot();
        viewStore.shelfPath.push(item.name);
        viewStore.updateShelfFolder();
        return;
    }
    // 电子书与 zip 走同一套「取页列表 → 进阅读页」的流程
    const list: ViewFileExtType[] = ["image", "video", "zip", "pdf", "epub", "mobi"];
    if (list.includes(item.extType)) {
        const res = await viewStore.updateComicViewList(item);
        if (res.code != 200) {
            msg.error(res.msg);
            return;
        }
        // 记下「这次点的是哪一页」，reader 打开时按名字定位；不落盘，刷新后自动失效
        viewStore.pendingOpenName = item.name;
        router.push({ path: "/reader" });
        return;
    }
    msg.warning("暂不支持读取此文件");
};

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
    void nextTick(() => restore());
});

// 去阅读页 / 切标签页回来时，列表没被重建，直接恢复位置
onActivated(() => {
    void restore();
});
onDeactivated(() => {
    snapshot();
});
onBeforeUnmount(() => {
    snapshot();
});
</script>
