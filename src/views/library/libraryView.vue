<template>
    <div class="library-view">
        <!-- 顶部工具条 -->
        <div class="toolbar">
            <div class="toolbar-title">
                书库
                <n-tag size="small" round :bordered="false">{{ viewStore.libraryList.length }}</n-tag>
            </div>
            <div class="toolbar-actions">
                <n-button quaternary circle :loading="loading" title="刷新" @click="refresh">
                    <template #icon>
                        <n-icon><RefreshOutlined /></n-icon>
                    </template>
                </n-button>
                <n-button v-if="isAdmin" type="primary" @click="addLibraryFn">
                    <template #icon>
                        <n-icon><Add12Filled /></n-icon>
                    </template>
                    新建
                </n-button>
            </div>
        </div>

        <!-- 列表 -->
        <div class="list" v-if="visibleList.length">
            <n-card
                v-for="item in visibleList"
                :key="item.uuid"
                class="lib-card"
                :class="{ 'is-current': isCurrent(item) }"
                :style="isCurrent(item) ? { borderColor: themeVars.primaryColor } : undefined"
                @click="toJump(item)"
            >
                <div class="lib-main">
                    <div class="lib-name">
                        <span class="name-text">{{ item.name }}</span>
                        <n-tag v-if="isCurrent(item)" size="small" type="success" round :bordered="false">正在使用</n-tag>
                        <n-tag v-for="group in item.groupList || []" :key="group" size="small" round :bordered="false">{{ group }}</n-tag>
                    </div>
                    <div class="lib-path" :title="item.pathUrl">{{ item.pathUrl }}</div>
                </div>
                <div class="lib-ops" @click.stop>
                    <n-button size="small" type="primary" secondary @click="toJump(item)">进入</n-button>
                    <n-dropdown v-if="isAdmin" trigger="click" :options="menuOptions" @select="onMenu($event, item)">
                        <n-button size="small" quaternary circle title="更多">
                            <template #icon>
                                <n-icon><EllipsisHorizontal /></n-icon>
                            </template>
                        </n-button>
                    </n-dropdown>
                </div>
            </n-card>
        </div>

        <!-- 加载中 -->
        <div class="placeholder" v-else-if="loading">
            <n-skeleton text :repeat="3" style="width: 60%" />
        </div>

        <!-- 空 -->
        <div class="placeholder" v-else>
            <n-empty :description="emptyText" size="huge">
                <template #extra v-if="isAdmin">
                    <n-button type="primary" size="small" @click="addLibraryFn">新建书库</n-button>
                </template>
            </n-empty>
        </div>

        <!-- 新建 / 编辑 -->
        <n-drawer v-model:show="openDrawer" placement="top" :height="520" @after-enter="onShow">
            <n-drawer-content :title="drawerType == 'add' ? '新建书库' : '编辑书库'" :native-scrollbar="false">
                <n-form label-placement="top" :show-require-mark="false">
                    <n-form-item label="仓库名">
                        <n-input v-model:value="formData.name" placeholder="例如：我的漫画" @keydown.enter.prevent="toSave" />
                    </n-form-item>
                    <n-form-item label="路径">
                        <LibraryPathInput v-model:value="formData.pathUrl" placeholder="输入路径，或点开下拉逐级选择" />
                    </n-form-item>
                    <n-form-item label="分组">
                        <n-select v-model:value="formData.groupList" multiple :options="configStore.groupList" placeholder="可不选" />
                    </n-form-item>
                </n-form>
                <n-flex>
                    <n-button type="primary" :loading="saving" @click="toSave">保存</n-button>
                    <n-button :loading="testing" @click="toTest(formData)">测试路径</n-button>
                    <n-button @click="toCancel">取消</n-button>
                </n-flex>
            </n-drawer-content>
        </n-drawer>
    </div>
</template>

<script setup lang="ts">
import { useThemeVars, useMessage, useDialog } from "naive-ui";
import { computed, onMounted, ref } from "vue";
import { Add12Filled } from "@vicons/fluent";
import { RefreshOutlined } from "@vicons/material";
import { EllipsisHorizontal } from "@vicons/ionicons5";
import { useConfigStore } from "@/stores/config";
import { useRouter } from "vue-router";
import LibraryPathInput from "@/views/library/components/LibraryPathInput.vue";
import { libraryFetch } from "@/utils/jFetch";
import { useViewStore } from "@/stores/view";
import { touchHistoryLibrary } from "@/views/history/historyData";

const themeVars = useThemeVars();
const configStore = useConfigStore();
const viewStore = useViewStore();
const router = useRouter();

const msg = useMessage();
const dialog = useDialog();

const openDrawer = ref(false);
const drawerType = ref<"add" | "edit">("add");
const editing = ref<JsonLibrary | null>(null);
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);

const formData = ref(<EditLibraryType>{
    name: "",
    pathUrl: "",
    groupList: []
});

const isAdmin = computed(() => configStore.userType == "admin");
const visibleList = computed(() => viewStore.libraryList);
const emptyText = computed(() => (isAdmin.value ? "还没有书库，先新建一个" : "书库是空的"));

const isCurrent = (item: JsonLibrary) => item.editUUID == viewStore.curLibrary?.editUUID;

const menuOptions = [
    { label: "编辑（名称 / 路径 / 分组）", key: "edit" },
    { label: "重新扫描", key: "update" },
    { label: "测试路径", key: "test" },
    { type: "divider", key: "divider" },
    { label: "删除", key: "remove" }
];

const addLibraryFn = () => {
    editing.value = null;
    formData.value = { name: "", pathUrl: "", groupList: [] };
    drawerType.value = "add";
    openDrawer.value = true;
};

const toEdit = (item: JsonLibrary) => {
    editing.value = item;
    // 深拷一份，别把表单绑到列表里的那个对象上（否则边输入列表边变，取消也不回滚）
    formData.value = {
        name: item.name,
        pathUrl: item.pathUrl,
        groupList: [...(item.groupList || [])]
    };
    drawerType.value = "edit";
    openDrawer.value = true;
};

const toSave = async () => {
    const name = (formData.value.name || "").trim();
    const pathUrl = (formData.value.pathUrl || "").trim();
    if (!name) return msg.error("请填写仓库名");
    if (!pathUrl) return msg.error("请填写路径");

    const payload: EditLibraryType = {
        name,
        // 服务端改名只认 newName（见 server/utils/library.ts 的 editLib）
        newName: name,
        pathUrl,
        groupList: formData.value.groupList || []
    };

    saving.value = true;
    const editUUID = editing.value?.uuid;
    const res =
        drawerType.value == "add" || !editUUID
            ? await libraryFetch.request("add", payload)
            : await libraryFetch.request("edit", { ...payload, uuid: editUUID });
    saving.value = false;

    if (res.code != 200) {
        msg.error(res.msg || "保存失败");
        return;
    }
    msg.success(res.msg || "保存成功");
    openDrawer.value = false;
    await loadList(true);
};

const toUpdate = async (item: JsonLibrary) => {
    const res = await viewStore.updateLibrary(item);
    if (res.code != 200) {
        msg.error(res.msg || "重新扫描失败");
        return;
    }
    msg.success(res.msg || "已重新扫描");
};

const toRemove = (item: JsonLibrary) => {
    dialog.warning({
        title: "删除书库",
        content: `确定删除「${item.name}」吗？只会移除这条记录，不会删磁盘上的文件。`,
        positiveText: "删除",
        negativeText: "取消",
        onPositiveClick: async () => {
            const res = await viewStore.removeLibrary(item);
            if (res.code != 200) {
                msg.error(res.msg || "删除失败");
                return;
            }
            msg.success(res.msg || "已删除");
        }
    });
};

const toTest = async (item: EditLibraryType) => {
    const pathUrl = (item.pathUrl || "").trim();
    if (!pathUrl) return msg.error("请先填写路径");
    testing.value = true;
    const res = await libraryFetch.request("folderTest", { pathUrl });
    testing.value = false;
    if (res.code == 200) {
        msg.success(res.msg || "路径可用");
    } else {
        msg.error(res.msg || "路径不可用");
    }
};

const toJump = (item: JsonLibrary) => {
    viewStore.setLibrary(item);
    // 记一条「打开过的书库」到云端历史
    touchHistoryLibrary({
        libraryUUID: item.uuid,
        libraryName: item.name,
        pathUrl: item.pathUrl
    });
    router.push({ path: "/shelf" });
};

const onMenu = (key: string, item: JsonLibrary) => {
    if (key == "edit") toEdit(item);
    else if (key == "update") void toUpdate(item);
    else if (key == "test") void toTest(item);
    else if (key == "remove") toRemove(item);
};

const toCancel = () => {
    openDrawer.value = false;
};

/** silent=true 时不弹「已刷新」，用于增删改之后的自动重载 */
const loadList = async (silent = false) => {
    loading.value = true;
    const res = await viewStore.updateLibraryList();
    loading.value = false;
    if (res.code != 200) {
        msg.error(res.msg || "获取书库失败");
        return res;
    }
    if (!silent) msg.success(res.msg || "已刷新");
    return res;
};

const refresh = () => void loadList();

const getGroupList = async () => {
    const res = await configStore.updateGroupList();
    if (res.code != 200) {
        msg.error(res.msg || "获取分组失败");
    }
};

const onShow = () => {
    void getGroupList();
};

onMounted(() => {
    void loadList(true);
});
</script>

<style scoped>
.library-view {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 8px;
}

.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 2px;
}

.toolbar-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05rem;
    font-weight: 600;
}

.toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 2px 2px 12px;
}

.lib-card {
    cursor: pointer;
    border-radius: 10px;
    transition: border-color 0.15s ease, background-color 0.15s ease;
}

.lib-card:hover {
    background: rgba(127, 127, 127, 0.08);
}

.lib-card :deep(.n-card__content) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
}

.lib-main {
    min-width: 0;
    flex: 1;
}

.lib-name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}

.name-text {
    font-size: 1rem;
    font-weight: 600;
}

.lib-path {
    margin-top: 2px;
    font-size: 0.76rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    opacity: 0.55;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.lib-ops {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
