<template>
    <div v-if="isEmpty" class="st-scope shelf-view">
        <div class="st-empty shelf-empty">
            <p>书架是空的</p>
            <button class="st-btn" type="button" @click="$router.push('/library')">去书库挑一本</button>
        </div>
    </div>
    <div v-else class="st-scope shelf-view">
        <header class="st-page-head shelf-head">
            <div class="shelf-head-row">
                <h1 class="st-title">{{ libraryName }}</h1>
                <span class="shelf-count">共 {{ viewStore.shelfFileList.length }} 项</span>
            </div>
            <nav class="shelf-crumbs" aria-label="目录路径">
                <button class="shelf-crumb" type="button" :disabled="atRoot" @click="toHome">{{ libraryName }}</button>
                <template v-for="(item, index) in viewStore.shelfPath" :key="index">
                    <span class="shelf-crumb-sep" aria-hidden="true">/</span>
                    <button class="shelf-crumb" type="button" @click="toSelectPath(index)">{{ item }}</button>
                </template>
                <span class="shelf-crumb-spacer"></span>
                <button class="shelf-crumb shelf-crumb--back" type="button" :disabled="atRoot" @click="toBack">上一级</button>
            </nav>
        </header>

        <section class="st-panel shelf-panel">
            <div class="shelf-tools">
                <div class="shelf-search">
                    <input
                        v-model="viewStore.shelfSearchKey"
                        class="st-input"
                        type="search"
                        placeholder="输入关键字，回车筛选"
                        aria-label="搜索书架"
                        @keyup.enter="runSearch"
                    />
                    <button class="st-btn" type="button" @click="runSearch">搜索</button>
                </div>
                <div class="shelf-filters">
                    <button class="st-btn st-btn--ghost" type="button" @click="toggleSortValue">
                        {{ viewStore.shelfSortValue == 1 ? "正序" : "反序" }}
                    </button>
                    <n-dropdown trigger="click" :options="sortNameOptions" @select="toSelectSortType">
                        <button class="st-btn st-btn--ghost" type="button">{{ sortNameList[viewStore.shelfSortType] }}</button>
                    </n-dropdown>
                    <n-dropdown trigger="click" :options="includeOptions" @select="toSelectIncludeType">
                        <button class="st-btn st-btn--ghost" type="button">{{ includeList[viewStore.shelfIncludeType] }}</button>
                    </n-dropdown>
                    <button class="st-btn st-btn--ghost" type="button" :disabled="viewStore.shelfLoading" @click="toUpdate">刷新</button>
                </div>
            </div>

            <div v-if="viewStore.shelfLoading" class="shelf-skeleton" aria-hidden="true">
                <span v-for="i in 6" :key="i" class="st-skeleton"></span>
            </div>
            <div v-else-if="viewStore.shelfFileList.length" class="shelf-list">
                <FileListItem2 ref="listRef"></FileListItem2>
            </div>
            <div v-else class="st-empty">{{ emptyTip }}</div>
        </section>

        <div class="scroll-fabs">
            <button class="st-icon-btn" type="button" title="回到顶部" @click="scrollToTop">
                <n-icon :size="18"><ArrowUpOutline /></n-icon>
            </button>
            <button class="st-icon-btn" type="button" title="滚到底部" @click="scrollToBottom">
                <n-icon :size="18"><ArrowDownOutline /></n-icon>
            </button>
        </div>
    </div>
</template>
<script setup lang="ts">
import { useViewStore } from "@/stores/view";
import { viewFetch } from "@/utils/jFetch";
import { useMessage } from "naive-ui";
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowDownOutline, ArrowUpOutline } from "@vicons/ionicons5";
// import FileListItem from "./components/FileListItem.vue";
import FileListItem2 from "./components/FileListItem2.vue";

defineOptions({
    name: "shelfView"
});

const viewStore = useViewStore();
const router = useRouter();

const msg = useMessage();

const isEmpty = ref(true);

/** 顶栏面包屑第一格显示当前书库名，点它回到这个库的根目录 */
const libraryName = computed(() => viewStore.curLibrary?.name || "书库");
const atRoot = computed(() => viewStore.shelfPath.length === 0);

const sortNameList = ref(<{ [x in SortNameType]: string }>{
    createTime: "创建时间",
    extension: "扩展名",
    name: "名称",
    size: "大小",
    updateTime: "更新时间",
    number: "数字"
});
const includeList = ref(<{ [x in IncludeFileType]: string }>{
    filefolder: "文件文件夹",
    file: "文件",
    folder: "文件夹"
});

const toHome = () => {
    if (viewStore.shelfLoading) {
        msg.warning("正在刷新中,请勿操作");
        return;
    }
    if (viewStore.shelfPath.length == 0) {
        return;
    }
    viewStore.shelfPath = [];
    viewStore.updateShelfFolder();
};

const toBack = () => {
    if (viewStore.shelfLoading) {
        msg.warning("正在刷新中,请勿操作");
        return;
    }
    if (viewStore.shelfPath.length == 0) {
        return;
    }
    viewStore.shelfPath = viewStore.shelfPath.slice(0, -1);
    viewStore.updateShelfFolder();
};

const toSelectPath = (index: number) => {
    if (viewStore.shelfLoading) {
        msg.warning("正在刷新中,请勿操作");
        return;
    }
    viewStore.shelfPath = viewStore.shelfPath.slice(0, index + 1);
    viewStore.updateShelfFolder();
};

const isBusy = () => {
    if (viewStore.shelfLoading) {
        msg.warning("正在刷新中,请勿操作");
        return true;
    }
    return false;
};

const sortNameKeys: SortNameType[] = ["createTime", "extension", "name", "size", "updateTime", "number"];
const sortNameOptions = computed(() => sortNameKeys.map((key) => ({ label: sortNameList.value[key], key })));
const includeKeys: IncludeFileType[] = ["filefolder", "file", "folder"];
const includeOptions = computed(() => includeKeys.map((key) => ({ label: includeList.value[key], key })));

const toSelectSortType = (key: string | number) => {
    if (isBusy()) {
        return;
    }
    viewStore.shelfSortType = key as SortNameType;
    viewStore.sortShelfFileList();
};

const toggleSortValue = () => {
    if (isBusy()) {
        return;
    }
    viewStore.shelfSortValue = viewStore.shelfSortValue == 1 ? -1 : 1;
    viewStore.sortShelfFileList();
};

const toSelectIncludeType = (key: string | number) => {
    if (isBusy()) {
        return;
    }
    viewStore.shelfIncludeType = key as IncludeFileType;
    viewStore.sortShelfFileList();
};

const runSearch = () => {
    if (isBusy()) {
        return;
    }
    viewStore.sortShelfFileList();
};

const emptyTip = computed(() => (viewStore.shelfSearchKey.trim() ? "没有匹配的文件" : "这里没有可显示的文件"));

// 输入关键字时防抖过滤，回车或点「搜索」立即生效
let searchTimer: number | undefined;
watch(
    () => viewStore.shelfSearchKey,
    () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => viewStore.sortShelfFileList(), 250);
    }
);
onDeactivated(() => window.clearTimeout(searchTimer));
onBeforeUnmount(() => window.clearTimeout(searchTimer));

const toUpdate = async () => {
    await updateList();
};

const listRef = ref<InstanceType<typeof FileListItem2>>();

/** 滚到底/顶端之前先把当前位置记进列表组件，返回时还能回到原处 */
const scrollToTop = () => {
    listRef.value?.snapshot();
    void listRef.value?.scrollToTop();
};

const scrollToBottom = () => {
    listRef.value?.snapshot();
    void listRef.value?.scrollToBottom();
};

/** 当前列表对应的「书库 + 目录」，与 store 里的 shelfDataKey 比较判断要不要重新请求 */
const folderKey = () =>
    `${viewStore.curLibrary.editUUID || ""}::${(viewStore.shelfPath || []).join("/")}`;

const updateList = async () => {
    await viewStore.updateShelfFolder();
};

const checkLibrary = async () => {
    if (!viewStore.curLibrary.editUUID) {
        isEmpty.value = true;
        return;
    }
    // 只有真的换了书库才清空书架路径。从阅读页返回、或刷新后重新挂载 shelfView 时，
    // 路径都应该沿用上次的（它本身就存在 store 里并持久化）。
    if (!viewStore.shelfLibraryUUID) {
        // 老数据没有这个标记：直接认领当前书库，别把用户已有的路径清掉
        viewStore.shelfLibraryUUID = viewStore.curLibrary.uuid || "";
        viewStore.save();
    } else if (viewStore.curLibrary.uuid != viewStore.shelfLibraryUUID) {
        viewStore.shelfPath = [];
        viewStore.shelfLibraryUUID = viewStore.curLibrary.uuid || "";
        isEmpty.value = true;
        viewStore.save();
    }
    const res = await viewFetch.request("checkFolder", { editUUID: viewStore.curLibrary.editUUID, path: viewStore.shelfPath.join("/") });
    if (res.code != 200) {
        isEmpty.value = true;
        // 401 由全局统一弹登录并回首页；其余（目录被删/路径非法）也回首页兜底
        if (res.code != 401) {
            msg.error(res.msg || "目录不存在");
            viewStore.shelfPath = [];
            viewStore.save();
            router.replace({ path: "/library" });
        }
        return;
    }
    if (viewStore.shelfDataKey !== folderKey()) {
        // 列表不是当前这个书库/目录的就拉一次。用 store 里的 shelfDataKey 判断，而不是
        // 组件内的临时变量：从子目录进阅读页再返回时，组件激活看到的已经是新路径，
        // 临时变量还停在上一次由书架页自己发起的加载上，会误判成没加载过而整份重拉。
        await updateList();
    }
    isEmpty.value = false;
};

onActivated(() => {
    checkLibrary();
});
</script>

<style scoped>
/* 书架不整页滚动：列表自己滚（虚拟列表 + 位置记忆），所以这里是定高 flex 列 */
.shelf-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--st-ink);
    padding: 0 16px;
}

@media (min-width: 1000px) {
    .shelf-view {
        width: 100%;
        max-width: 860px;
        margin: 0 auto;
        padding: 32px 48px 24px;
        background: transparent;
    }
}

.shelf-head {
    flex: none;
    padding: 18px 0 8px;
}

.shelf-head-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
}

@media (min-width: 1000px) {
    .shelf-head {
        padding: 0 0 14px;
    }
}

.shelf-crumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
}

.shelf-crumbs::-webkit-scrollbar {
    display: none;
}

.shelf-crumb {
    flex: none;
    min-height: 44px;
    padding: 0 6px;
    border: 0;
    background: transparent;
    color: var(--st-graphite);
    font-family: inherit;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.15s ease;
}

.shelf-crumb:hover {
    color: var(--st-paper);
}

.shelf-crumb:disabled {
    color: var(--st-paper);
    cursor: default;
}

.shelf-crumb:focus-visible {
    outline: 2px solid var(--st-paper);
    outline-offset: 0;
}

.shelf-crumb-sep {
    flex: none;
    font-family: var(--st-font-mono);
    font-size: 12px;
    color: var(--st-line);
}

.shelf-crumb-spacer {
    flex: 1;
    min-width: 12px;
}

.shelf-crumb--back {
    border: 1px solid var(--st-line);
    border-radius: var(--st-radius);
    padding: 0 12px;
    color: var(--st-paper);
}

.shelf-crumb--back:disabled {
    opacity: 0.4;
}

.shelf-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 10px 0 8px;
    border-top: 1px solid var(--st-line);
}

@media (min-width: 1000px) {
    .shelf-panel {
        padding: 12px 0 0;
    }
}

.shelf-tools {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding-bottom: 8px;
}

.shelf-search {
    flex: 1 1 260px;
    display: flex;
    gap: 8px;
    min-width: 0;
}

/* 手机上排序 / 过滤 / 刷新保持一行，放不下就横向滑，不折成第三行 */
.shelf-filters {
    flex: 1 0 auto;
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
}

.shelf-filters::-webkit-scrollbar {
    display: none;
}

.shelf-count {
    flex: none;
    font-family: var(--st-font-mono);
    font-size: 11px;
    color: var(--st-graphite);
    white-space: nowrap;
}

.shelf-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--st-line);
}

.shelf-skeleton {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 14px;
    overflow: hidden;
}

.shelf-skeleton .st-skeleton:nth-child(4n + 1) {
    width: 64%;
}

.shelf-skeleton .st-skeleton:nth-child(4n + 2) {
    width: 81%;
}

.shelf-skeleton .st-skeleton:nth-child(4n + 3) {
    width: 49%;
}

.shelf-skeleton .st-skeleton:nth-child(4n) {
    width: 72%;
}

.shelf-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 16px;
    padding: 0 20px;
    font-size: 15px;
}

/* 书架右下角的快捷滚动按钮，留出底部 60px 导航栏的空间 */
.scroll-fabs {
    position: fixed;
    right: 12px;
    bottom: 64px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* 桌面上贴到内容栏右缘，别漂在视口最右边 */
@media (min-width: 1000px) {
    .scroll-fabs {
        right: calc((100vw - 860px) / 2 + 8px);
        bottom: 72px;
    }
}
</style>
