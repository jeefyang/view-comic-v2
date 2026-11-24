<template>
    <div class="st-scope history-view">
        <header class="st-page-head hist-head">
            <div class="hist-head-row">
                <h1 class="st-title">历史</h1>
                <span class="hist-total">{{ tab === "history" ? readHistory.length : bookmarks.length }} 条</span>
            </div>
            <div class="hist-seg" role="tablist" aria-label="历史与书签">
                <button class="hist-seg-btn" type="button" role="tab" :aria-selected="tab === 'history'" @click="tab = 'history'">
                    历史 <b>{{ readHistory.length }}</b>
                </button>
                <button class="hist-seg-btn" type="button" role="tab" :aria-selected="tab === 'bookmark'" @click="tab = 'bookmark'">
                    书签 <b>{{ bookmarks.length }}</b>
                </button>
            </div>
        </header>

        <section class="st-panel hist-panel">
            <div class="hist-tools">
                <span class="hist-hint">{{ tab === "history" ? "点一下回到上次看到的那一页" : "阅读时点悬浮菜单里的「添加书签」" }}</span>
                <n-popconfirm v-if="tab === 'history'" @positive-click="onClearHistory">
                    <template #trigger>
                        <button class="st-btn st-btn--ghost" type="button" :disabled="!readHistory.length">清空历史</button>
                    </template>
                    历史会从云端一起删掉，确定吗？
                </n-popconfirm>
                <n-popconfirm v-else @positive-click="onClearBookmarks">
                    <template #trigger>
                        <button class="st-btn st-btn--ghost" type="button" :disabled="!bookmarks.length">清空书签</button>
                    </template>
                    书签会从云端一起删掉，确定吗？
                </n-popconfirm>
            </div>

            <div v-show="tab === 'history'" ref="historyWrap" class="hist-list">
                <VirtualList
                    v-if="readHistory.length"
                    :list-data="readHistory"
                    :container-height="historyHeight"
                    :estimated-item-height="76"
                >
                    <template #default="{ item }">
                        <HistoryRow v-if="item.kind === 'book'" :item="item" @open="openBook" @remove="removeHistoryItem" />
                        <LibraryRow v-else :item="item" @open="openLibrary" @remove="removeHistoryItem" />
                    </template>
                </VirtualList>
                <div v-else class="st-empty hist-empty">还没有打开记录</div>
            </div>

            <div v-show="tab === 'bookmark'" ref="bookmarkWrap" class="hist-list">
                <VirtualList
                    v-if="bookmarks.length"
                    :list-data="bookmarks"
                    :container-height="bookmarkHeight"
                    :estimated-item-height="76"
                >
                    <template #default="{ item }">
                        <BookmarkRow :item="item" @open="openBookmark" @remove="removeBookmark" />
                    </template>
                </VirtualList>
                <div v-else class="st-empty hist-empty">还没有书签</div>
            </div>
        </section>
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

<style scoped>
/* 和历史列表一样是「定高 + 列表自己滚」，虚拟列表才有可用的高度 */
.history-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--st-ink);
    padding: 0 16px;
}

@media (min-width: 1000px) {
    .history-view {
        width: 100%;
        max-width: 860px;
        margin: 0 auto;
        padding: 32px 48px 24px;
        background: transparent;
    }
}

.hist-head {
    flex: none;
    padding: 18px 0 8px;
}

@media (min-width: 1000px) {
    .hist-head {
        padding: 0 0 14px;
    }
}

.hist-head-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
}

.hist-total {
    flex: none;
    font-family: var(--st-font-mono);
    font-size: 11px;
    color: var(--st-graphite);
    white-space: nowrap;
}

.hist-seg {
    display: flex;
    gap: 4px;
    margin-top: 8px;
}

.hist-seg-btn {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--st-line);
    border-radius: var(--st-radius);
    background: transparent;
    color: var(--st-graphite);
    font-family: inherit;
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.hist-seg-btn:hover {
    color: var(--st-paper);
}

.hist-seg-btn[aria-selected="true"] {
    color: var(--st-paper);
    border-color: var(--st-vermilion);
    background: var(--st-vermilion-wash);
}

.hist-seg-btn b {
    font-family: var(--st-font-mono);
    font-size: 11px;
    font-weight: 400;
    color: var(--st-graphite);
}

.hist-seg-btn[aria-selected="true"] b {
    color: var(--st-vermilion);
}

.hist-seg-btn:focus-visible {
    outline: 2px solid var(--st-paper);
    outline-offset: 2px;
}

.hist-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 8px 0 0;
    border-top: 1px solid var(--st-line);
}

.hist-tools {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 6px;
}

.hist-hint {
    min-width: 0;
    font-size: 12px;
    color: var(--st-graphite);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.hist-list {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-top: 1px solid var(--st-line);
}

.hist-empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
