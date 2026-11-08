<template>
    <div class="parent">
        <n-tabs
            v-model:value="tab"
            type="line"
            animated
            class="tabs"
            justify-content="space-evenly"
            pane-class="tab-pane"
        >
            <n-tab-pane name="history" :tab="`历史 ${readHistory.length}`">
                <div class="pane">
                    <div class="pane-head">
                        <span class="hint">点一下回到上次看到的那一页</span>
                        <n-popconfirm @positive-click="onClearHistory">
                            <template #trigger>
                                <n-button text size="tiny" :disabled="!readHistory.length">清空历史</n-button>
                            </template>
                            历史会从云端一起删掉，确定吗？
                        </n-popconfirm>
                    </div>
                    <div ref="historyWrap" class="list-wrap">
                        <VirtualList
                            v-if="readHistory.length"
                            :list-data="readHistory"
                            :container-height="historyHeight"
                            :estimated-item-height="88"
                        >
                            <template #default="{ item }">
                                <HistoryRow
                                    v-if="item.kind === 'book'"
                                    :item="item"
                                    class="mb-2"
                                    @open="openBook"
                                    @remove="removeHistoryItem"
                                />
                                <LibraryRow
                                    v-else
                                    :item="item"
                                    class="mb-2"
                                    @open="openLibrary"
                                    @remove="removeHistoryItem"
                                />
                            </template>
                        </VirtualList>
                        <n-empty v-else class="empty" description="还没有打开记录" />
                    </div>
                </div>
            </n-tab-pane>

            <n-tab-pane name="bookmark" :tab="`书签 ${bookmarks.length}`">
                <div class="pane">
                    <div class="pane-head">
                        <span class="hint">阅读时点悬浮菜单里的「添加书签」</span>
                        <n-popconfirm @positive-click="onClearBookmarks">
                            <template #trigger>
                                <n-button text size="tiny" :disabled="!bookmarks.length">清空书签</n-button>
                            </template>
                            书签会从云端一起删掉，确定吗？
                        </n-popconfirm>
                    </div>
                    <div ref="bookmarkWrap" class="list-wrap">
                        <VirtualList
                            v-if="bookmarks.length"
                            :list-data="bookmarks"
                            :container-height="bookmarkHeight"
                            :estimated-item-height="88"
                        >
                            <template #default="{ item }">
                                <BookmarkRow :item="item" class="mb-2" @open="openBookmark" @remove="removeBookmark" />
                            </template>
                        </VirtualList>
                        <n-empty v-else class="empty" description="还没有书签" />
                    </div>
                </div>
            </n-tab-pane>
        </n-tabs>
    </div>
</template>

<script lang="ts" setup>
import { computed, onActivated, ref } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import { useElementSize } from "@vueuse/core";
import { useViewStore } from "@/stores/view";
import VirtualList from "@/components/VirtualList.vue";
import HistoryRow from "./components/HistoryRow.vue";
import LibraryRow from "./components/LibraryRow.vue";
import BookmarkRow from "./components/BookmarkRow.vue";
import {
    bookmarks,
    clearBookmarks,
    clearHistory,
    loadHistory,
    readHistory,
    removeBookmark,
    removeHistoryItem,
} from "./historyData";

defineOptions({ name: "historyView" });

const msg = useMessage();
const router = useRouter();
const viewStore = useViewStore();

const tab = ref<"history" | "bookmark">("history");

const historyWrap = ref<HTMLElement>();
const bookmarkWrap = ref<HTMLElement>();
/** 列表高度跟着容器走：切标签页时隐藏的那一栏高度是 0，撑开后再由 ResizeObserver 补回来 */
const { height: historyBoxHeight } = useElementSize(historyWrap);
const { height: bookmarkBoxHeight } = useElementSize(bookmarkWrap);
const historyHeight = computed(() => Math.max(historyBoxHeight.value, 120));
const bookmarkHeight = computed(() => Math.max(bookmarkBoxHeight.value, 120));

/** 书库列表是「打开历史」的前置条件（要按 uuid 找回书库） */
const ensureLibraries = async () => {
    if (!viewStore.libraryList.length) {
        await viewStore.updateLibraryList();
    }
};

/**
 * 从历史打开一本书：先切到它所属的书库，把书架路径摆到它所在的目录，
 * 再按「目录 + 书名」请求一次 comicViewList，最后让 reader 落在上次那一页。
 */
const openBook = async (item: ReadHistoryBookItemType) => {
    await ensureLibraries();
    const library = viewStore.libraryList.find((lib) => lib.uuid === item.libraryUUID);
    if (!library) {
        msg.error("这本书所属的书库已经不存在了");
        return;
    }
    viewStore.setLibrary(library);
    viewStore.shelfPath = item.parentPath ? item.parentPath.split("/").filter(Boolean) : [];
    // 显示用的书名可能被规范成「根目录」，请求要用真实名字：basePath 的最后一段，根目录的书就是 "."
    const realName = item.basePath.split("/").filter(Boolean).pop() || ".";
    const file = { name: realName, extType: item.extType, isDir: item.isDir } as ViewFileType;
    const res = await viewStore.updateComicViewList(file, item.parentPath);
    if (res.code != 200) {
        msg.error(res.msg || "这本书打不开了");
        return;
    }
    const pages = viewStore.comicFileList?.list ?? [];
    const fallback = pages[Math.min(Math.max(item.page - 1, 0), Math.max(pages.length - 1, 0))];
    // reader 认「这次点的是哪一页」，优先用记下的文件名，旧记录没存名字时退回页码
    viewStore.pendingOpenName = item.pageName || fallback?.name || "";
    router.push({ path: "/reader" });
};

const openBookmark = async (item: BookmarkItemType) => {
    await openBook({
        id: item.id,
        kind: "book",
        editUUID: item.editUUID,
        libraryUUID: item.libraryUUID,
        libraryName: item.libraryName,
        basePath: item.basePath,
        parentPath: item.parentPath,
        name: item.name,
        extType: item.extType,
        isDir: item.isDir,
        page: item.page,
        total: 0,
        pageName: item.pageName,
        openTime: item.createTime,
    });
};

/** 打开书库：回到书架根目录 */
const openLibrary = async (item: ReadHistoryLibraryItemType) => {
    await ensureLibraries();
    const library = viewStore.libraryList.find((lib) => lib.uuid === item.libraryUUID);
    if (!library) {
        msg.error("这个书库已经不存在了");
        return;
    }
    viewStore.setLibrary(library);
    viewStore.shelfPath = [];
    router.push({ path: "/shelf" });
};

const onClearHistory = () => {
    clearHistory();
    msg.success("已清空历史");
};

const onClearBookmarks = () => {
    clearBookmarks();
    msg.success("已清空书签");
};

onActivated(() => {
    void loadHistory();
});
</script>

<style scoped lang="scss">
.parent {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 8px 8px;
    box-sizing: border-box;
}

.tabs {
    flex: 1;
    min-height: 0;
}

:deep(.n-tabs-pane-wrapper) {
    flex: 1;
    min-height: 0;
}

:deep(.tab-pane) {
    height: 100%;
    padding-top: 8px;
    box-sizing: border-box;
}

.pane {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.pane-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
}

.hint {
    opacity: 0.55;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.list-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
</style>
