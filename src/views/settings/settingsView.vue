<template>
    <div class="parent">
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
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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
    /* #main 是定高 + overflow:hidden 的 flex 容器，这一页内容比一屏高，
       必须自己滚动，否则底部（数据页的清理按钮等）会被直接裁掉 */
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 24px;
    box-sizing: border-box;

    /* 和其它列表页保持一致：能滚但不显示滚动条 */
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
    }

    .tabs {
        padding: 0 8px;
    }

    :deep(.tab-pane) {
        padding: 12px 4px;
    }
}
</style>
