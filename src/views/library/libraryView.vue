<template>
    <div class="st-scope st-page library-view">
        <header class="st-page-head">
            <div class="lib-head-row">
                <h1 class="st-title">书库</h1>
                <div class="lib-head-actions">
                    <button class="st-icon-btn" type="button" title="刷新书库列表" :disabled="loading" @click="refresh">
                        <n-icon :size="18"><RefreshOutlined /></n-icon>
                    </button>
                    <button v-if="isAdmin" class="st-btn st-btn--primary" type="button" @click="addLibraryFn">新建书库</button>
                </div>
            </div>
            <p class="st-lede">每个库都是一个可以直接翻的目录。点开一个，就进它的书架。</p>
        </header>

        <section class="st-panel" aria-labelledby="lib-panel-title">
            <header class="st-panel-head">
                <span class="st-panel-index">{{ visibleList.length }} 座</span>
                <h2 id="lib-panel-title" class="st-panel-title">全部书库</h2>
            </header>

            <ul v-if="visibleList.length" class="lib-list">
                <li v-for="(item, index) in visibleList" :key="item.uuid" class="lib-item" :class="{ 'is-current': isCurrent(item) }">
                    <button class="lib-open" type="button" @click="toJump(item)">
                        <span class="lib-index" aria-hidden="true">{{ String(index + 1).padStart(2, "0") }}</span>
                        <span class="lib-main">
                            <span class="lib-name-row">
                                <span class="lib-name">{{ item.name }}</span>
                                <span v-if="isCurrent(item)" class="st-tag st-tag--accent">正在使用</span>
                                <span v-for="group in item.groupList || []" :key="group" class="st-tag">{{ group }}</span>
                            </span>
                            <span class="lib-path" :title="item.pathUrl">{{ item.pathUrl }}</span>
                        </span>
                    </button>
                    <div v-if="isAdmin" class="lib-ops">
                        <n-dropdown trigger="click" :options="menuOptions" @select="onMenu($event, item)">
                            <button class="st-icon-btn" type="button" title="更多操作">
                                <n-icon :size="18"><EllipsisHorizontal /></n-icon>
                            </button>
                        </n-dropdown>
                    </div>
                </li>
            </ul>

            <div v-else-if="loading" class="lib-skeleton" aria-hidden="true">
                <span v-for="i in 3" :key="i" class="st-skeleton"></span>
            </div>

            <div v-else class="st-empty">
                <p>{{ emptyText }}</p>
                <button v-if="isAdmin" class="st-btn st-btn--primary lib-empty-btn" type="button" @click="addLibraryFn">新建书库</button>
            </div>
        </section>

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
import { useMessage, useDialog } from "naive-ui";
import { computed, onMounted, ref } from "vue";
import { RefreshOutlined } from "@vicons/material";
import { EllipsisHorizontal } from "@vicons/ionicons5";
import { useConfigStore } from "@/stores/config";
import { useRouter } from "vue-router";
import LibraryPathInput from "@/views/library/components/LibraryPathInput.vue";
import { libraryFetch } from "@/utils/jFetch";
import { useViewStore } from "@/stores/view";
import { touchHistoryLibrary } from "@/views/history/historyData";

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
.lib-head-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.lib-head-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 10px;
}

.lib-list {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--st-line);
}

.lib-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--st-line);
    transition: background-color 0.15s ease;
}

.lib-item:hover {
    background: var(--st-graphite-wash);
}

.lib-item.is-current::before {
    content: "";
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 0;
    width: 2px;
    background: var(--st-vermilion);
}

.lib-open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 66px;
    padding: 12px 8px 12px 6px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.lib-open:focus-visible {
    outline: 2px solid var(--st-paper);
    outline-offset: -2px;
}

.lib-index {
    flex: none;
    width: 30px;
    font-family: var(--st-font-mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
    color: var(--st-graphite);
}

.lib-item.is-current .lib-index {
    color: var(--st-vermilion);
}

.lib-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.lib-name-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.lib-name {
    font-family: var(--st-font-display);
    font-size: 18px;
    line-height: 1.3;
    color: var(--st-paper);
    word-break: break-all;
}

.lib-path {
    font-family: var(--st-font-mono);
    font-size: 11px;
    line-height: 1.5;
    color: var(--st-graphite);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.lib-ops {
    flex: none;
    padding-right: 8px;
}

.lib-skeleton {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 0;
}

.lib-skeleton .st-skeleton:nth-child(1) {
    width: 58%;
}

.lib-skeleton .st-skeleton:nth-child(2) {
    width: 74%;
}

.lib-skeleton .st-skeleton:nth-child(3) {
    width: 46%;
}

.lib-empty-btn {
    margin-top: 14px;
}

/* 桌面一行更舒展 */
@media (min-width: 700px) {
    .lib-open {
        gap: 16px;
        min-height: 76px;
        padding: 14px 8px 14px 12px;
    }

    .lib-name {
        font-size: 20px;
    }
}
</style>
