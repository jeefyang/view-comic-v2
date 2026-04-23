<template>
    <n-flex vertical style="height: 100%">
        <n-flex justify="space-between" style="width: 100%">
            <div>
                <n-icon size="50" :color="themeVars.primaryColor" @click="addLibraryFn" v-if="configStore.userType == 'admin'">
                    <Add12Filled />
                </n-icon>
            </div>
            <n-icon size="50" :color="themeVars.primaryColor" @click="getList()">
                <RefreshOutlined />
            </n-icon>
        </n-flex>
        <n-flex style="flex: 1; width: 100%" vertical>
            <!-- 空 -->
            <n-flex style="width: 100%; height: 100%" justify="center" align="center" v-if="viewStore.libraryList.length == 0">
                <n-empty description="书库是空的" size="huge"> </n-empty>
            </n-flex>
            <!-- 列表 -->
            <n-space vertical v-else>
                <n-card
                    :title="item.name"
                    v-for="item in viewStore.libraryList"
                    :key="item.name"
                    :style="{ 'border-color': item.editUUID == viewStore?.curLibrary?.editUUID ? themeVars.primaryColor : undefined }"
                >
                    <div class="mb-2">{{ item.pathUrl }}</div>
                    <n-flex justify="space-between">
                        <n-button size="tiny" @click="toJump(item)" type="primary">跳转</n-button>
                        <n-flex>
                            <template v-if="configStore.userType == 'admin'">
                                <n-button size="tiny" @click="toUpdate(item)" type="primary">更新</n-button>
                                <n-button size="tiny" @click="toEdit(item)" type="primary">编辑</n-button>
                                <n-button size="tiny" @click="toTest(item)">测试</n-button>
                                <n-button size="tiny" @click="toRemove(item)" type="error">删除</n-button></template
                            >
                        </n-flex>
                    </n-flex>
                </n-card>
            </n-space>
        </n-flex>
    </n-flex>
    <!-- 下拉 -->
    <n-drawer v-model:show="openDrawer" placement="top" :height="500" @after-enter="onShow">
        <n-drawer-content :title="drawerType == 'add' ? '新建' : '编辑'">
            <n-form ref="formRef" :model="formData"> </n-form>
            <n-form-item label="仓库名" path="name">
                <n-input v-model:value="formData.name" placeholder="输入仓库名" />
            </n-form-item>
            <n-form-item label="路径" path="pathUrl">
                <XDropdownInput v-model:value="formData.pathUrl" :options="showPathOptions" placeholder="输入路径,/添加提示" @change="hadndlePathInput"></XDropdownInput>
            </n-form-item>
            <n-form-item label="分组" path="groupList">
                <n-select v-model:value="formData.groupList" multiple :options="configStore.groupList" />
            </n-form-item>
            <n-flex>
                <n-button type="primary" @click="toSave">保存</n-button>
                <n-button @click="toTest(formData)">测试</n-button>
                <n-button @click="toCancel">取消</n-button>
            </n-flex>
        </n-drawer-content>
    </n-drawer>
</template>

<script setup lang="ts">
import { useThemeVars, useMessage, useDialog } from "naive-ui";
import { onMounted, ref } from "vue";
import { Add12Filled } from "@vicons/fluent";
import { RefreshOutlined } from "@vicons/material";
import { useConfigStore } from "@/stores/config";
import { useRoute, useRouter } from "vue-router";
import XDropdownInput from "@/components/XDropdownInput.vue";
import { libraryFetch, userFetch } from "@/utils/jFetch";
import { useViewStore } from "@/stores/view";

const themeVars = useThemeVars();
const openDrawer = ref(false);
const drawerType = ref(<"add" | "edit">"add");
const formRef = ref(null);
const configStore = useConfigStore();
const viewStore = useViewStore();
const route = useRoute();
const router = useRouter();

const msg = useMessage();
const dialog = useDialog();

const formData = ref(<EditLibraryType>{
    name: "",
    pathUrl: "",
    newName: "",
    groupList: []
});

let curFolderPath = "";
let pathOption: { label: string; key: string; show?: boolean }[] = [];
const showPathOptions = ref(<typeof pathOption>[]);

const hadndlePathInput = async (p: string) => {
    const newFolderPath = p.includes("/")
        ? p
              .split("/")
              .splice(0, p.split("/").length - 1)
              .join("/") + "/"
        : "";
    if (!newFolderPath) {
        curFolderPath = "";
        showPathOptions.value = [];
        return;
    } else if (!curFolderPath || newFolderPath != curFolderPath) {
        curFolderPath = newFolderPath;
        const res = await libraryFetch.request("folderList", { pathUrl: curFolderPath });
        if (res.code == 200) {
            const list: string[] = res.data!.list;
            pathOption = list.map((item) => {
                return {
                    label: item,
                    key: curFolderPath + item + "/"
                };
            });
        }
    }
    const arr = p.split("/");
    const a = arr[arr.length - 1] || "";
    showPathOptions.value = [...pathOption.filter((item) => item.label.includes(a))];
};

const addLibraryFn = () => {
    formData.value = {
        name: "",
        pathUrl: "",
        groupList: []
    };
    openDrawer.value = true;
    drawerType.value = "add";
};

const toSave = async () => {
    const res = drawerType.value == "add" ? await libraryFetch.request("add", { ...formData.value }) : await libraryFetch.request("edit", { ...formData.value });
    if (res.code != 200) {
        msg.error(res.msg || "");
        return;
    }
    msg.success(res.msg || "");
    openDrawer.value = false;
    getList();
};

const toEdit = async (item: JsonLibrary) => {
    formData.value = item;
    openDrawer.value = true;
    drawerType.value = "edit";
};

const toUpdate = async (item: JsonLibrary) => {
    const res = await viewStore.updateLibrary(item);
    if (res.code != 200) {
        msg.error(res.msg || "");
        return;
    }

    msg.success(res.msg || "");
};

const toRemove = async (item: JsonLibrary) => {
    dialog.warning({
        title: "删除",
        content: `确定删除仓库 ${item.name} 吗？`,
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: async () => {
            const res = await viewStore.removeLibrary(item);
            if (res.code != 200) {
                msg.error(res.msg || "");
                return;
            }
            getList();
        }
    });
};

const toTest = async (item: EditLibraryType) => {
    const res = await libraryFetch.request("folderTest", { ...item });
    if (res.code == 200) {
        msg.success(res.msg || "");
    } else {
        msg.error(res.msg || "");
    }
};

const toJump = (item: JsonLibrary) => {
    // window.open(item.pathUrl);
    viewStore.setLibrary(item);
    router.push({ path: "/shelf" });
};

const toCancel = () => {
    openDrawer.value = false;
};

const getList = async () => {
    const res = await viewStore.updateLibraryList();
    if (res.code != 200) {
        msg.error(res.msg || "");
        return;
    }
    msg.success(res.msg || "");
};

const getGroupList = async () => {
    const res = await configStore.updateGroupList();
    if (res.code != 200) {
        return msg.error(res.msg || "");
    }
};

const onShow = async () => {
    getGroupList();
};

onMounted(() => {
    getList();
});
</script>
