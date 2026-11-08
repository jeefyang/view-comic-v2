<template>
    <template v-if="isEmpty">
        <n-flex style="width: 100%; height: 100%" justify="center" align="center">
            <n-empty description="书架是空的" size="huge"> </n-empty>
        </n-flex>
    </template>
    <template v-else>
        <n-flex vertical style="height: 100%">
            <n-flex align="center" style="gap: 0" :style="{ border: `1px solid ${themeVars.borderColor}` }">
                <n-button quaternary :disabled="atRoot" title="回到根目录" @click="toHome">
                    <n-icon>
                        <HomeOutline></HomeOutline>
                    </n-icon>
                </n-button>
                <n-flex style="flex: 1; flex-wrap: nowrap; overflow: auto; scrollbar-width: none">
                    <n-breadcrumb>
                        <n-breadcrumb-item @click="toHome">{{ libraryName }}</n-breadcrumb-item>
                        <n-breadcrumb-item v-for="(item, index) in viewStore.shelfPath" :key="index" @click="toSelectPath(index)">{{ item }}</n-breadcrumb-item>
                    </n-breadcrumb>
                </n-flex>
                <n-button quaternary :disabled="atRoot" title="返回上一级" @click="toBack">
                    <n-icon> <ArrowBack></ArrowBack> </n-icon>
                </n-button>
            </n-flex>

            <n-input-group>
                <n-button type="primary" @click="runSearch"> 搜索 </n-button>
                <n-input v-model:value="viewStore.shelfSearchKey" :style="{ width: '100%' }" placeholder="请输入关键字" clearable @keyup.enter="runSearch" />
            </n-input-group>
            <n-flex align="center" style="gap: 8px">
                <n-button-group>
                    <n-button type="success" @click="toggleSortValue">{{ viewStore.shelfSortValue == 1 ? "正序" : "反序" }}</n-button>
                    <n-dropdown trigger="click" :options="sortNameOptions" @select="toSelectSortType">
                        <n-button type="info">{{ sortNameList[viewStore.shelfSortType] }}</n-button>
                    </n-dropdown>
                    <n-dropdown trigger="click" :options="includeOptions" @select="toSelectIncludeType">
                        <n-button type="warning">{{ includeList[viewStore.shelfIncludeType] }}</n-button>
                    </n-dropdown>
                    <n-button @click="toUpdate" :loading="viewStore.shelfLoading">刷新</n-button>
                </n-button-group>
                <div class="list-count">共 {{ viewStore.shelfFileList.length }} 项</div>
            </n-flex>
            <n-flex v-if="viewStore.shelfLoading" vertical style="flex: 1; min-height: 0; overflow: hidden">
                <n-skeleton v-for="i in 6" :key="i" height="76px" :sharp="false" style="margin-bottom: 8px; border-radius: 6px" />
            </n-flex>
            <n-flex v-else-if="viewStore.shelfFileList.length" vertical style="flex: 1; min-height: 0">
                <FileListItem2 ref="listRef"></FileListItem2>
                <div class="scroll-fabs">
                    <n-button circle secondary size="medium" title="回到顶部" @click="scrollToTop">
                        <template #icon>
                            <n-icon><ArrowUpOutline></ArrowUpOutline></n-icon>
                        </template>
                    </n-button>
                    <n-button circle secondary size="medium" title="滚到底部" @click="scrollToBottom">
                        <template #icon>
                            <n-icon><ArrowDownOutline></ArrowDownOutline></n-icon>
                        </template>
                    </n-button>
                </div>
            </n-flex>
            <n-flex v-else style="flex: 1" justify="center" align="center">
                <n-empty :description="emptyTip"></n-empty>
            </n-flex>
        </n-flex>
    </template>
</template>
<script setup lang="ts">
import { useViewStore } from "@/stores/view";
import { viewFetch } from "@/utils/jFetch";
import { useMessage, useThemeVars } from "naive-ui";
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowBack, ArrowDownOutline, ArrowUpOutline, HomeOutline } from "@vicons/ionicons5";
// import FileListItem from "./components/FileListItem.vue";
import FileListItem2 from "./components/FileListItem2.vue";

defineOptions({
    name: "shelfView"
});

const themeVars = useThemeVars();
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

/** 上次成功拉过列表的「书库 + 目录」，用来判断进入书架时还要不要重新请求 */
let loadedKey = "";

const folderKey = () =>
    `${viewStore.curLibrary.editUUID || ""}::${(viewStore.shelfPath || []).join("/")}`;

const updateList = async () => {
    await viewStore.updateShelfFolder();
    loadedKey = folderKey();
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
    if (isEmpty.value || !viewStore.shelfFileList.length || loadedKey !== folderKey()) {
        // 进入书架时只要「当前没有列表」或「列表不是这个书库/目录的」就拉一次。
        // 以前只在 isEmpty（换书库）时拉，导致同一书库再次进来时列表是空的、
        // 必须手点刷新才出来；服务端刚重启过的场景也表现为「列表没查出来」。
        await updateList();
    }
    isEmpty.value = false;
};

onActivated(() => {
    checkLibrary();
});
</script>

<style scoped>
.list-count {
    font-size: 0.72rem;
    opacity: 0.5;
    margin-left: auto;
    white-space: nowrap;
}

/* 书架右下角的快捷滚动按钮，留出底部 60px 导航栏的空间 */
.scroll-fabs {
    position: fixed;
    right: 14px;
    bottom: 76px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
</style>
