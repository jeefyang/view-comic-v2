<!-- src/views/ReaderView.vue -->
<template>
    <div class="reader-container">
        <waterfall v-if="isInit && isWaterfall" :jump="jump" @update:current="onCurrentChange"></waterfall>
        <paged-reader v-else-if="isInit" :jump="jump" @update:current="onCurrentChange" @action="onReaderAction" />
    </div>
    <file-name-bar v-if="isInit && readerFeatures.fileName !== false && fileName" :name="fileName"></file-name-bar>
    <page-indicator
        v-if="isInit && readerFeatures.pageIndicator && totalPage > 0"
        :current="currentIndex"
        :total="totalPage"
        @click="showJump = true"
    ></page-indicator>
    <page-jump-modal v-model:show="showJump" :current="currentIndex" :total="totalPage" @jump="onJump"></page-jump-modal>
    <file-list-drawer
        v-model:show="showFileList"
        :current="currentIndex"
        :pages="readerPages"
        @jump="onFileJump"
    ></file-list-drawer>
    <n-button
        v-if="uiVisible && readerFeatures.backButton !== false"
        class="reader-home"
        size="small"
        circle
        secondary
        @click="goShelf"
    >
        <n-icon size="18">
            <ArrowBackRound />
        </n-icon>
    </n-button>
    <float-btn
        v-if="uiVisible"
        ref="floatBtnRef"
        v-model:x="floatBtnX"
        v-model:y="floatBtnY"
        is-right
        dock-side
        @tap="onFloatBtnTap"
    >
        <n-icon size="40">
            <ModeStandbyRound />
        </n-icon>
    </float-btn>
    <float-actions
        v-model:show="actionsOpen"
        :anchor="floatBtnAnchor"
        :bookmarked="!!currentBookmark"
        @action="onFloatAction"
    />
    <reader-settings-drawer v-model:show="settingsDrawer" />
</template>

<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { useViewStore } from "@/stores/view";
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Waterfall from "./components/Waterfall.vue";
import PagedReader from "./modes/paged/PagedReader.vue";
import FloatBtn from "./components/FloatBtn.vue";
import FloatActions from "./components/FloatActions.vue";
import type { FloatActionKey } from "./components/floatActions";
import PageIndicator from "./components/PageIndicator.vue";
import FileNameBar from "./components/FileNameBar.vue";
import PageJumpModal from "./components/PageJumpModal.vue";
import FileListDrawer from "./components/FileListDrawer.vue";
import ReaderSettingsDrawer from "./components/ReaderSettingsDrawer.vue";
import { readerFeatures } from "./readerFeatures";
import { readerSettings } from "./readerSettings";
import { readerSort } from "./readerSort";
import { indexOfPageName, readerPages } from "./readerPages";
import { getProgressKey, loadProgress, saveProgress } from "./readerProgress";
import type { TapActionKey } from "./tapZones/actions";
import {
    addBookmark,
    findBookmark,
    flushHistory,
    historyLoaded,
    loadHistory,
    removeBookmark,
    touchHistoryBook,
    updateHistoryPage,
} from "@/views/history/historyData";
import { normalizeBasePath } from "@/utils/fileUrl";
import { setMediaCacheErrorHandler } from "@/utils/mediaCache";
import { ArrowBackRound, ModeStandbyRound } from "@vicons/material";
import { useMessage } from "naive-ui";

const msg = useMessage();

const isInit = ref(false);

const floatBtnX = ref(100);
/** 竖向默认放在屏幕中间偏上，左右由 FloatBtn 自己贴边 */
const floatBtnY = ref(Math.max(Math.round(window.innerHeight / 2) - 80, 0));
/** 悬浮按钮组件实例，用来给展开菜单做定位锚点 */
const floatBtnRef = ref<InstanceType<typeof FloatBtn> | null>(null);
const floatBtnAnchor = computed<HTMLElement | null>(() => {
    const instance = floatBtnRef.value as any;
    return (instance?.el as HTMLElement | undefined) ?? (instance?.$el as HTMLElement | undefined) ?? null;
});

const jump = ref(0);
/** 当前页（0 基），由当前阅读模式滚动/翻页时上报 */
const currentIndex = ref(0);
/** 页码跳转弹窗 */
const showJump = ref(false);
/** 文件列表抽屉 */
const showFileList = ref(false);
/** 当前页的文件名，排序规则变化时靠它把位置找回来 */
const currentName = ref("");
/** 悬浮按钮的展开菜单 */
const actionsOpen = ref(false);
/** 阅读设置抽屉 */
const settingsDrawer = ref(false);
/** 点击区域里的「显示/隐藏悬浮按钮」 */
const uiVisible = ref(true);

const configStore = useConfigStore();
const viewStore = useViewStore();
const router = useRouter();

const isWaterfall = computed(() => readerSettings.mode === "waterfall");

/** 当前这本书的进度 key：书库 + 目录 + 文件 */
const progressKey = computed(() => {
    const list = viewStore.comicFileList;
    if (!viewStore.curLibrary?.editUUID || !list?.baseFile) {
        return "";
    }
    return getProgressKey(viewStore.curLibrary.editUUID, list.basePath || "", list.baseFile.name || "");
});

const totalPage = computed(() => readerPages.value.length);

/** 这本书在书库里的完整相对路径：压缩包是 `sub/img.zip`，目录书是 `a/b` */
const currentBookPath = computed(() => normalizeBasePath(viewStore.comicFileList?.basePath || ""));

/** 这本书所在目录，历史里存下来，重开时按它请求 comicViewList */
const currentParentPath = computed(() => currentBookPath.value.split("/").slice(0, -1).join("/"));

/** 当前页是否已经加过书签，决定悬浮菜单里显示「添加书签」还是「取消书签」 */
const currentBookmark = computed(() => {
    const library = viewStore.curLibrary;
    if (!library?.editUUID || !viewStore.comicFileList?.baseFile) {
        return undefined;
    }
    const pageName = readerPages.value[currentIndex.value]?.name || currentName.value || "";
    return findBookmark(library.editUUID, currentBookPath.value, pageName, currentIndex.value + 1);
});

/**
 * 显示在页码上方的文件名：优先当前页的文件名（书架里看到的 img-001.jpg 这种），
 * 单页翻页与瀑布流都跟着当前页走；取不到再退回压缩包 / 目录名。
 */
const fileName = computed(() => {
    const list = viewStore.comicFileList;
    const page = readerPages.value[currentIndex.value];
    return page?.name || list?.baseFile?.name || list?.basePath || "";
});

/**
 * 读取进入时的落点；没记录或越界一律回第 0 页。
 * startAt：从书架直接点开目录型漫画里的某张图时，那页在**服务端返回的列表**里的下标。
 * startName：那张图的文件名。列表随时可能被重排，所以优先按名字定位，下标只作兜底。
 */
const restoreJump = (startAt = 0, startName = "") => {
    const maxIndex = Math.max(totalPage.value - 1, 0);
    // 点了具体某一页就停在那页，而不是跳回上次读到的地方
    if (startName) {
        const byName = indexOfPageName(startName);
        if (byName >= 0) {
            return byName;
        }
    }
    if (startAt > 0) {
        return Math.min(startAt, maxIndex);
    }
    if (!readerFeatures.progressRestore || !progressKey.value) {
        return 0;
    }
    const progress = loadProgress(progressKey.value);
    if (!progress) {
        return 0;
    }
    // 排序规则可能换过，旧下标已失效，先按记下的文件名找
    const byName = indexOfPageName(progress.name ?? "");
    if (byName >= 0) {
        return byName;
    }
    if (progress.index < 0 || progress.index >= totalPage.value) {
        return 0;
    }
    return progress.index;
};

/** 任何异常（未登录 / 压缩包被删 / 目录不存在）统一回首页兜底 */
const toHome = (message?: string) => {
    if (message) {
        msg.error(message);
    }
    isInit.value = false;
    router.replace({ path: "/library" });
};

const goLibrary = () => {
    router.replace({ path: "/library" });
};

/** 回书架：书架路径保存在 view store 里，回来仍是同一层目录 */
const goShelf = () => {
    router.replace({ path: "/shelf" });
};

let initPending = false;

const init = async () => {
    if (initPending) {
        return;
    }
    // 未登录：不请求任何接口，直接回首页（避免连环 401 弹窗）
    if (!configStore.isLogin) {
        return toHome();
    }
    const list = viewStore.comicFileList;
    if (!viewStore.curLibrary?.editUUID || !list?.baseFile || !list.list?.length) {
        return toHome();
    }
    initPending = true;
    // 云端历史/书签是异步的，先发起，不挡住阅读；书签按钮真正用到时会再等它
    void loadHistory();
    /**
     * 只有「本次会话里从书架点了某一页」才按那一页落点。
     * comicFileList.start 会随缓存一起持久化，刷新后它还是上次点开的页，
     * 拿它定位就会出现「刷新后跳到几十页开外」的怪现象，所以这里只认内存标记。
     */
    const clickedName = viewStore.pendingOpenName;
    viewStore.pendingOpenName = "";
    const clickedStart = clickedName ? viewStore.comicFileList?.list?.findIndex((item) => item.name === clickedName) ?? -1 : -1;
    try {
        // 本地缓存可能是很久以前的书，重新校验一次资源是否还在
        const res = await viewStore.reloadComicViewList();
        if (res.code != 200 || !viewStore.comicFileList?.list?.length) {
            return toHome(res.msg || "压缩包或目录不存在");
        }
        // 先算好 jump 再挂载阅读组件，首帧就落在目标页
        const target = restoreJump(clickedStart, clickedName);
        // 视频页不能在瀑布流播放：从书架点开视频时自动切到单页
        const targetPage = readerPages.value[target];
        const targetExt = (targetPage?.ext || "").toLowerCase();
        const targetIsVideo = targetPage?.extType === "video" || targetExt === "mp4" || targetExt === "webm";
        if (targetIsVideo && readerSettings.mode === "waterfall") {
            readerSettings.mode = "paged";
        }
        currentIndex.value = target;
        currentName.value = readerPages.value[target]?.name ?? "";
        applyJump(target);
        isInit.value = true;
        // 记一条云端历史（同一本书只更新、顶到最前）
        recordHistory(target);
    } finally {
        initPending = false;
    }
};

const onCurrentChange = (index: number) => {
    currentIndex.value = index;
    // 记下名字，重排后用它把位置找回来
    const name = readerPages.value[index]?.name;
    if (name) {
        currentName.value = name;
    }
};

/** 设置 jump 并让当前阅读模式定位过去；值相同时先置 -1 再下一帧设回，否则组件的 watch 不触发 */
const applyJump = (target: number) => {
    if (jump.value === target) {
        jump.value = -1;
        nextTick(() => {
            jump.value = target;
        });
        return;
    }
    jump.value = target;
};

/** 页码跳转：通过 props.jump 的变化让当前模式定位到目标页 */
const onJump = (page: number) => {
    const target = Math.min(Math.max(page, 0), Math.max(totalPage.value - 1, 0));
    if (target === currentIndex.value) {
        return;
    }
    currentIndex.value = target;
    currentName.value = readerPages.value[target]?.name ?? currentName.value;
    applyJump(target);
};

/** 文件列表里点选：先关抽屉再跳 */
const onFileJump = (index: number) => {
    showFileList.value = false;
    onJump(index);
};

/**
 * 书的名字：书库根目录下的书，服务端给的是 baseFile.name="."，存进 store 时被 normalizeFileName 归一成空串，
 * 这里必须再兜一层——空名字会让 touchHistoryBook 直接放弃，连网络请求都不会发。
 */
const bookDisplayName = () =>
    viewStore.comicFileList?.baseFile?.name || currentBookPath.value.split("/").pop() || "根目录";

/** 把这本书写进云端历史：同一本书只更新一条，并顶到最前 */
const recordHistory = (index: number) => {
    const list = viewStore.comicFileList;
    const library = viewStore.curLibrary;
    if (!configStore.isLogin || !library?.editUUID || !list?.baseFile) {
        return;
    }
    touchHistoryBook({
        editUUID: library.editUUID,
        libraryUUID: library.uuid ?? "",
        libraryName: library.name ?? "",
        basePath: currentBookPath.value,
        parentPath: currentParentPath.value,
        name: bookDisplayName(),
        extType: list.baseFile.extType,
        isDir: !!list.baseFile.isDir,
        page: index + 1,
        total: totalPage.value,
        pageName: readerPages.value[index]?.name ?? "",
    });
};

/** 页码变了就更新历史里的进度：只改本地，停手一会儿才由 historyData 统一推云端 */
const syncHistoryPage = (index: number) => {
    const library = viewStore.curLibrary;
    if (!configStore.isLogin || !library?.editUUID) {
        return;
    }
    updateHistoryPage(
        library.editUUID,
        currentBookPath.value,
        index + 1,
        totalPage.value,
        readerPages.value[index]?.name ?? ""
    );
};

/** 悬浮菜单与点击区域共用：当前页有书签就取消，没有就加 */
const toggleBookmarkOfPage = async () => {
    const list = viewStore.comicFileList;
    const library = viewStore.curLibrary;
    if (!library?.editUUID || !list?.baseFile) {
        return;
    }
    // 还没从云端拉过书签时先拉一次，避免用空列表把云端书签覆盖掉
    if (!historyLoaded.value) {
        await loadHistory();
    }
    const pageName = readerPages.value[currentIndex.value]?.name || currentName.value || "";
    const existing = findBookmark(library.editUUID, currentBookPath.value, pageName, currentIndex.value + 1);
    if (existing) {
        removeBookmark(existing.id);
        msg.success("已取消书签");
        return;
    }
    addBookmark({
        editUUID: library.editUUID,
        libraryUUID: library.uuid ?? "",
        libraryName: library.name ?? "",
        basePath: currentBookPath.value,
        parentPath: currentParentPath.value,
        name: bookDisplayName(),
        extType: list.baseFile.extType,
        isDir: !!list.baseFile.isDir,
        page: currentIndex.value + 1,
        pageName,
    });
    msg.success(`已添加书签：第 ${currentIndex.value + 1} 页`);
};

let saveTimer: any;
/** 上一次记录的进度 key，用于识别刚切换到另一本书的情况 */
let lastProgressKey = "";

const flushProgress = () => {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
    }
    if (!readerFeatures.progressRestore || !progressKey.value) {
        return;
    }
    saveProgress(progressKey.value, currentIndex.value, totalPage.value, currentName.value);
};

watch([currentIndex, progressKey], () => {
    if (!readerFeatures.progressRestore || !progressKey.value) {
        return;
    }
    // 刚切到另一本书时 currentIndex 还是上一本的，先等 init 同步 jump 再记录
    if (progressKey.value != lastProgressKey) {
        lastProgressKey = progressKey.value;
        return;
    }
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
        saveTimer = undefined;
        saveProgress(progressKey.value, currentIndex.value, totalPage.value, currentName.value);
    }, 300);
});

/** 翻页时同步历史里的进度：写的是本地列表，停手一会儿才由 historyData 推云端 */
watch([currentIndex, progressKey], () => {
    if (!isInit.value) {
        return;
    }
    syncHistoryPage(currentIndex.value);
});

/**
 * 排序规则变化：列表顺序会整体变，当前下标失去意义。
 * 按记下的文件名重新定位，阅读位置不跳。
 */
watch(
    () => [readerSort.type, readerSort.order] as const,
    () => {
        const target = indexOfPageName(currentName.value);
        if (target < 0 || target === currentIndex.value) {
            return;
        }
        currentIndex.value = target;
        applyJump(target);
    }
);

/** 切换阅读模式时把当前页同步过去，避免跳回旧位置 */
watch(
    () => readerSettings.mode,
    () => {
        actionsOpen.value = false;
        const target = currentIndex.value;
        if (jump.value === target) {
            jump.value = -1;
            nextTick(() => {
                jump.value = target;
            });
            return;
        }
        jump.value = target;
    }
);

const onFloatBtnTap = () => {
    actionsOpen.value = !actionsOpen.value;
};

const onFloatAction = (key: FloatActionKey) => {
    if (key === "backToShelf") {
        goShelf();
        return;
    }
    if (key === "backToLibrary") {
        goLibrary();
        return;
    }
    if (key === "openSettings") {
        settingsDrawer.value = true;
        return;
    }
    if (key === "fileList") {
        showFileList.value = true;
        return;
    }
    if (key === "jumpPage") {
        showJump.value = true;
        return;
    }
    if (key === "toggleBookmark") {
        void toggleBookmarkOfPage();
    }
};

/** 点击区域里除翻页以外的动作，由阅读页统一处理 */
const onReaderAction = (key: TapActionKey) => {
    if (key === "toggleUI") {
        uiVisible.value = !uiVisible.value;
        actionsOpen.value = false;
        return;
    }
    if (key === "openSettings") {
        settingsDrawer.value = true;
        return;
    }
    if (key === "backToShelf") {
        goShelf();
        return;
    }
    if (key === "backToLibrary") {
        goLibrary();
        return;
    }
    if (key === "jumpPage") {
        showJump.value = true;
        return;
    }
    if (key === "toggleBookmark") {
        void toggleBookmarkOfPage();
    }
};

onActivated(() => {
    init();
});

/** 离开阅读页：进度与云端历史都立刻落盘 */
const flushAll = () => {
    flushProgress();
    void flushHistory();
};

onDeactivated(() => {
    // 离开 reader 时立刻落盘，避免防抖窗口内的滚动丢失
    flushAll();
    actionsOpen.value = false;
    settingsDrawer.value = false;
});

/** 刷新 / 切到后台 / 关标签页时立刻落盘，避免 300ms 防抖窗口内的位置丢失 */
const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
        flushAll();
    }
};

onMounted(() => {
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", onVisibilityChange);
    // 媒体缓存写失败只提示一次；阅读与网络回退不受影响
    setMediaCacheErrorHandler((message) => msg.warning(message));
});

onBeforeUnmount(() => {
    window.removeEventListener("pagehide", flushAll);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    setMediaCacheErrorHandler();
});
</script>

<style scoped>
.reader-container {
    width: 100vw;
    height: 100vh;
    position: absolute;
    top: 0;
    left: 0;
}

/* 左上角回书库的小按钮，跟「显示/隐藏 UI」一起开关 */
.reader-home {
    position: fixed;
    top: calc(10px + env(safe-area-inset-top, 0px));
    left: 10px;
    z-index: 10;
    opacity: 0.75;
}

.reader-home:hover {
    opacity: 1;
}
</style>
