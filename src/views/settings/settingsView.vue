<template>
    <n-config-provider class="settings-shell" :theme-overrides="themeOverrides">
        <div class="st-scope settings-page">
            <header class="st-page-head">
                <h1 class="st-title">设置</h1>
                <p class="st-lede">调好留白、预加载与本地缓存。改动即时生效，离开这一页也不会丢。</p>
            </header>

            <nav ref="railRef" class="st-rail" role="tablist" aria-label="设置分组" @keydown="onRailKeydown">
                <button
                    v-for="item in tabs"
                    :key="item.key"
                    :data-tab="item.key"
                    class="st-rail-btn"
                    type="button"
                    role="tab"
                    :id="`settings-tab-${item.key}`"
                    :aria-selected="tab === item.key"
                    :aria-controls="`settings-panel-${item.key}`"
                    :tabindex="tab === item.key ? 0 : -1"
                    :disabled="item.disabled"
                    :title="item.disabled ? '瀑布流模式下没有翻页设置' : undefined"
                    @click="selectTab(item.key)"
                >
                    <span class="st-rail-index" aria-hidden="true">{{ item.index }}</span>
                    <span class="st-rail-text">
                        <span class="st-rail-label">{{ item.label }}</span>
                        <span class="st-rail-meta">{{ item.meta }}</span>
                    </span>
                </button>
            </nav>

            <main class="st-stage">
                <div
                    v-if="tab === 'reader'"
                    id="settings-panel-reader"
                    class="st-reveal"
                    role="tabpanel"
                    aria-labelledby="settings-tab-reader"
                    tabindex="0"
                >
                    <settings-reader />
                </div>
                <div
                    v-else-if="tab === 'paged'"
                    id="settings-panel-paged"
                    class="st-reveal"
                    role="tabpanel"
                    aria-labelledby="settings-tab-paged"
                    tabindex="0"
                >
                    <settings-paged />
                </div>
                <div
                    v-else-if="tab === 'account'"
                    id="settings-panel-account"
                    class="st-reveal"
                    role="tabpanel"
                    aria-labelledby="settings-tab-account"
                    tabindex="0"
                >
                    <settings-account />
                </div>
                <div
                    v-else
                    id="settings-panel-data"
                    class="st-reveal"
                    role="tabpanel"
                    aria-labelledby="settings-tab-data"
                    tabindex="0"
                >
                    <settings-data />
                </div>
            </main>
        </div>
    </n-config-provider>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, nextTick, ref, watch, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fitModeOptions } from "@/views/reader/modes/fitStrategies";
import { readerSettings } from "@/views/reader/readerSettings";
import { useConfigStore } from "@/stores/config";
import SettingsPanelSkeleton from "./components/SettingsPanelSkeleton.vue";
import { settingsThemeOverrides as themeOverrides } from "./theme";

const asyncTab = (loader: () => Promise<{ default: Component }>) =>
    defineAsyncComponent({ loader, loadingComponent: SettingsPanelSkeleton, delay: 80, timeout: 20000 });

const SettingsReader = asyncTab(() => import("./tabs/SettingsReader.vue"));
const SettingsPaged = asyncTab(() => import("./tabs/SettingsPaged.vue"));
const SettingsAccount = asyncTab(() => import("./tabs/SettingsAccount.vue"));
const SettingsData = asyncTab(() => import("./tabs/SettingsData.vue"));

type TabKey = "reader" | "paged" | "account" | "data";

const TAB_STORAGE_KEY = "settingsTab";
const tabKeys: TabKey[] = ["reader", "paged", "account", "data"];

const isTabKey = (value: unknown): value is TabKey => tabKeys.includes(value as TabKey);

const route = useRoute();
const router = useRouter();
const configStore = useConfigStore();

const readInitialTab = (): TabKey => {
    const fromQuery = route.query.tab;
    if (isTabKey(fromQuery)) {
        return fromQuery;
    }
    try {
        const saved = localStorage.getItem(TAB_STORAGE_KEY);
        if (saved && isTabKey(saved)) {
            return saved;
        }
    }
    catch {
        // 存储不可用就按默认页
    }
    return "reader";
};

const tab = ref<TabKey>(readInitialTab());

/** 瀑布流用不到「翻页」这一页；改成禁用而不是消失，用户能看到它为什么不可用 */
const isWaterfall = computed(() => readerSettings.mode === "waterfall");

watch(isWaterfall, value => {
    if (value && tab.value === "paged") {
        tab.value = "reader";
    }
});

if (isWaterfall.value && tab.value === "paged") {
    tab.value = "reader";
}

const fitLabel = computed(
    () => fitModeOptions.find(item => item.value === readerSettings.fitMode)?.label ?? "自适应"
);

const modeLabel = computed(() => (readerSettings.mode === "waterfall" ? "瀑布流" : "单页翻页"));

const tabs = computed(() => [
    {
        key: "reader" as TabKey,
        index: "01",
        label: "阅读",
        meta: `${modeLabel.value} · 边距 ${configStore.paddingTop}`,
        disabled: false
    },
    {
        key: "paged" as TabKey,
        index: "02",
        label: "翻页",
        meta: isWaterfall.value ? "瀑布流下不可用" : fitLabel.value,
        disabled: isWaterfall.value
    },
    {
        key: "account" as TabKey,
        index: "03",
        label: "账号",
        meta: configStore.username || "未登录",
        disabled: false
    },
    {
        key: "data" as TabKey,
        index: "04",
        label: "数据",
        meta: "缓存与清理",
        disabled: false
    }
]);

const railRef = ref<HTMLElement>();

const selectTab = (key: TabKey) => {
    const target = tabs.value.find(item => item.key === key);
    if (!target || target.disabled) {
        return;
    }
    tab.value = key;
};

/** 左右（上下）方向键在章节之间移动焦点，和原生 tablist 的习惯一致 */
const onRailKeydown = (event: KeyboardEvent) => {
    const enabled = tabs.value.filter(item => !item.disabled).map(item => item.key);
    const current = enabled.indexOf(tab.value);
    let next: TabKey | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = enabled[(current + 1) % enabled.length];
    }
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = enabled[(current - 1 + enabled.length) % enabled.length];
    }
    else if (event.key === "Home") {
        next = enabled[0];
    }
    else if (event.key === "End") {
        next = enabled[enabled.length - 1];
    }

    if (!next) {
        return;
    }
    event.preventDefault();
    tab.value = next;
    void nextTick(() => {
        railRef.value?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
    });
};

watch(tab, value => {
    try {
        localStorage.setItem(TAB_STORAGE_KEY, value);
    }
    catch {
        // 存储不可用就只在内存里记住
    }
    if (route.query.tab !== value) {
        void router.replace({ query: { ...route.query, tab: value } });
    }
});

/** 页面被 keep-alive 缓存时，地址栏里的 ?tab= 变化也要跟着切页 */
watch(
    () => route.query.tab,
    value => {
        if (typeof value !== "string" || !isTabKey(value) || value === tab.value) {
            return;
        }
        if (isWaterfall.value && value === "paged") {
            return;
        }
        tab.value = value;
    }
);
</script>
