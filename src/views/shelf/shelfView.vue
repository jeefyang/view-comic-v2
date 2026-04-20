<template>
    <template v-if="isEmpty">
        <n-flex style="width: 100%; height: 100%" justify="center" align="center">
            <n-empty description="书架是空的" size="huge"> </n-empty>
        </n-flex>
    </template>
    <template v-else>
        <n-flex vertical style="height: 100%">
            <n-flex align="center" style="gap: 0" :style="{ border: `1px solid ${themeVars.borderColor}` }">
                <n-button @click="toHome">
                    <n-icon>
                        <HomeOutline></HomeOutline>
                    </n-icon>
                </n-button>
                <n-flex style="flex: 1; flex-wrap: nowrap; overflow: auto; scrollbar-width: none">
                    <n-breadcrumb>
                        <n-breadcrumb-item v-for="(item, index) in viewStore.shelfPath" :key="index" @click="toSelectPath(index)">{{ item }}</n-breadcrumb-item>
                    </n-breadcrumb>
                </n-flex>
                <n-button @click="toBack">
                    <n-icon> <ArrowBack></ArrowBack> </n-icon>
                </n-button>
            </n-flex>

            <n-input-group>
                <n-button type="primary" :loading="viewStore.shelfLoading"> 搜索 </n-button>
                <n-input v-model:value="viewStore.shelfSearchKey" :style="{ width: '100%' }" placeholder="请输入关键字" clearable />
            </n-input-group>
            <n-button-group>
                <n-button type="info" @click="toChangeSortType">{{ sortNameList[viewStore.shelfSortType] }}</n-button>
                <n-button type="success" @click="toChangeSortValue">{{ viewStore.shelfSortValue == 1 ? "正序" : "反序" }}</n-button>
                <n-button type="warning" @click="toChangeFileType">{{ includeList[viewStore.shelfIncludeType] }}</n-button>
                <n-button @click="toUpdate" :loading="viewStore.shelfLoading">刷新</n-button>
            </n-button-group>
            <FileListItem2></FileListItem2>
        </n-flex>
    </template>
</template>
<script setup lang="ts">
import { useViewStore } from "@/stores/view";
import { viewFetch } from "@/utils/jFetch";
import { useMessage, useThemeVars } from "naive-ui";
import { computed, onActivated, ref } from "vue";
import { HomeOutline, ArrowBack } from "@vicons/ionicons5";
// import FileListItem from "./components/FileListItem.vue";
import FileListItem2 from "./components/FileListItem2.vue";

defineOptions({
    name: "shelfView"
});

const themeVars = useThemeVars();
const viewStore = useViewStore();
const libarayEditUUID = ref("");

const msg = useMessage();

const isEmpty = ref(true);
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

const toChangeSortType = () => {
    if (viewStore.shelfLoading) {
        msg.warning("正在刷新中,请勿操作");
        return;
    }
    const list: SortNameType[] = ["createTime", "extension", "name", "size", "updateTime", "number"];
    const index = list.indexOf(viewStore.shelfSortType);
    viewStore.shelfSortType = list[(index + 1) % list.length]!;
};

const toChangeSortValue = () => {
    if (viewStore.shelfLoading) {
        msg.warning("正在刷新中,请勿操作");
        return;
    }
    viewStore.shelfSortValue = viewStore.shelfSortValue == 1 ? -1 : 1;
    viewStore.sortShelfFileList();
};

const toChangeFileType = () => {
    if (viewStore.shelfLoading) {
        msg.warning("正在刷新中,请勿操作");
        return;
    }
    const list: IncludeFileType[] = ["filefolder", "file", "folder"];
    const index = list.indexOf(viewStore.shelfIncludeType);
    viewStore.shelfIncludeType = list[(index + 1) % list.length]!;
    viewStore.sortShelfFileList();
};

const toUpdate = async () => {
    await viewStore.updateShelfFolder();
};

const updateList = async () => {
    await viewStore.updateShelfFolder();
};

const checkLibrary = async () => {
    if (!viewStore.curLibrary.editUUID) {
        isEmpty.value = true;
        return;
    }
    if (viewStore.curLibrary.editUUID != libarayEditUUID.value) {
        viewStore.shelfPath = [];
        isEmpty.value = true;
        viewStore.save();
    }
    const res = await viewFetch.request("checkFolder", { editUUID: viewStore.curLibrary.editUUID, path: viewStore.shelfPath.join("/") });
    if (res.code != 200) {
        isEmpty.value = true;
        return;
    }
    if (isEmpty.value) {
        await updateList();
        libarayEditUUID.value = viewStore.curLibrary.editUUID;
    }
    isEmpty.value = false;
};

onActivated(() => {
    checkLibrary();
});
</script>
