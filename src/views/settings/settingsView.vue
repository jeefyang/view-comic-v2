<template>
    <div class="parent">
        <div v-if="readingNow" class="current">
            <div class="current-title">正在阅读</div>
            <div class="current-path">{{ readingNow.path }}</div>
            <div class="current-file">{{ readingNow.file }}</div>
        </div>
        <n-tabs v-model:value="tab" type="line" animated class="tabs" justify-content="space-evenly" pane-class="tab-pane">
            <n-tab-pane name="reader" tab="阅读">
                <settings-reader />
            </n-tab-pane>
            <n-tab-pane v-if="!isWaterfall" name="paged" tab="翻页">
                <settings-paged />
            </n-tab-pane>
            <n-tab-pane name="account" tab="账号">
                <settings-account />
            </n-tab-pane>
            <n-tab-pane name="data" tab="数据">
                <settings-data />
            </n-tab-pane>
        </n-tabs>
    </div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useViewStore } from "@/stores/view";
import { readerSettings } from "@/views/reader/readerSettings";

const SettingsReader = defineAsyncComponent(() => import("./tabs/SettingsReader.vue"));
const SettingsPaged = defineAsyncComponent(() => import("./tabs/SettingsPaged.vue"));
const SettingsAccount = defineAsyncComponent(() => import("./tabs/SettingsAccount.vue"));
const SettingsData = defineAsyncComponent(() => import("./tabs/SettingsData.vue"));

type TabKey = "reader" | "paged" | "account" | "data";

const TAB_STORAGE_KEY = "settingsTab";
const tabKeys: TabKey[] = ["reader", "paged", "account", "data"];

const isTabKey = (value: any): value is TabKey => tabKeys.includes(value);

const route = useRoute();
const router = useRouter();
const viewStore = useViewStore();

/** 设置页顶部显示「当前在读哪本书」：书库 / 书架路径 / 文件名，没有就整块隐藏 */
const readingNow = computed(() => {
    const file = viewStore.comicFileList?.baseFile;
    if (!file) {
        return null;
    }
    const segments: string[] = [];
    if (viewStore.curLibrary?.name) {
        segments.push(viewStore.curLibrary.name);
    }
    segments.push(...(viewStore.shelfPath || []));
    if (viewStore.comicFileList?.basePath) {
        segments.push(viewStore.comicFileList.basePath);
    }
    const path = segments.filter(Boolean).join(" / ") || "根目录";
    return { path, file: file.name || "" };
});

const readInitialTab = (): TabKey => {
    const fromQuery = route.query.tab;
    if (typeof fromQuery === "string" && isTabKey(fromQuery)) {
        return fromQuery;
    }
    try {
        const saved = localStorage.getItem(TAB_STORAGE_KEY);
        if (saved && isTabKey(saved)) {
            return saved;
        }
    } catch {
        // ignore
    }
    return "reader";
};

const tab = ref<TabKey>(readInitialTab());

/** 瀑布流用不到「翻页」这一页，直接隐藏；停在翻页页时自动退回阅读页 */
const isWaterfall = computed(() => readerSettings.mode === "waterfall");

watch(isWaterfall, value => {
    if (value && tab.value === "paged") {
        tab.value = "reader";
    }
});

if (isWaterfall.value && tab.value === "paged") {
    tab.value = "reader";
}

watch(tab, value => {
    try {
        localStorage.setItem(TAB_STORAGE_KEY, value);
    } catch {
        // ignore
    }
    if (route.query.tab !== value) {
        void router.replace({ query: { ...route.query, tab: value } });
    }
});
</script>

<style scoped lang="scss">
.parent {
    padding-bottom: 24px;

    .tabs {
        padding: 0 8px;
    }

    :deep(.tab-pane) {
        padding: 12px 4px;
    }
}

.current {
    margin: 8px 10px 4px;
    padding: 10px 12px;
    border-radius: var(--border-radius);
    background-color: var(--divider-color);

    .current-title {
        font-size: 12px;
        opacity: 0.55;
        margin-bottom: 4px;
    }

    .current-path {
        font-size: 13px;
        opacity: 0.8;
        word-break: break-all;
    }

    .current-file {
        font-size: 15px;
        margin-top: 2px;
        word-break: break-all;
    }
}
</style>
