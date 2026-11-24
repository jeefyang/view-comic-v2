<template>
    <n-drawer :show="modelShow" placement="bottom" :height="'68%'" @update:show="onUpdateShow">
        <n-drawer-content
            closable
            :native-scrollbar="false"
            body-content-style="padding: 0 16px 20px;"
        >
            <template #header>
                <div class="st-scope rs-head">
                    <span class="rs-eyebrow">READER</span>
                    <span class="rs-title">阅读设置</span>
                </div>
            </template>
            <n-config-provider :theme-overrides="settingsThemeOverrides">
                <div v-if="readingNow" class="st-scope rs-current">
                    <span class="rs-current-path">{{ readingNow.path }}</span>
                    <strong class="rs-current-file">{{ readingNow.file }}</strong>
                </div>
                <n-tabs v-model:value="tab" type="line" animated justify-content="space-evenly" pane-class="rs-pane">
                    <n-tab-pane name="reader" tab="阅读">
                        <settings-reader />
                    </n-tab-pane>
                    <n-tab-pane v-if="!isWaterfall" name="paged" tab="翻页">
                        <settings-paged />
                    </n-tab-pane>
                </n-tabs>
            </n-config-provider>
        </n-drawer-content>
    </n-drawer>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { readerSettings } from "@/views/reader/readerSettings";
import { settingsThemeOverrides } from "@/views/settings/theme";
import { useViewStore } from "@/stores/view";
import { normalizeBasePath } from "@/utils/fileUrl";

const SettingsReader = defineAsyncComponent(() => import("@/views/settings/tabs/SettingsReader.vue"));
const SettingsPaged = defineAsyncComponent(() => import("@/views/settings/tabs/SettingsPaged.vue"));

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ "update:show": [show: boolean] }>();

const viewStore = useViewStore();

/** 抽屉顶部显示「当前在读哪本书」：书库 / 书架路径 / 书名（根目录书的名字是空的，兜底成「根目录」） */
const readingNow = computed(() => {
    const list = viewStore.comicFileList;
    if (!list) {
        return null;
    }
    const segments: string[] = [];
    if (viewStore.curLibrary?.name) {
        segments.push(viewStore.curLibrary.name);
    }
    segments.push(...(viewStore.shelfPath || []));
    const basePath = normalizeBasePath(list.basePath || "");
    if (basePath) {
        segments.push(basePath);
    }
    const path = segments.filter(Boolean).join(" / ") || "根目录";
    const file = list.baseFile?.name || basePath.split("/").pop() || "根目录";
    return { path, file };
});

/** 抽屉内容按标签页分，避免一屏里堆太长 */
const tab = ref<"reader" | "paged">("reader");

/** 瀑布流用不到翻页设置，藏掉这一页 */
const isWaterfall = computed(() => readerSettings.mode === "waterfall");

watch(isWaterfall, value => {
    if (value && tab.value === "paged") {
        tab.value = "reader";
    }
});

const modelShow = computed({
    get: () => props.show,
    set: (value: boolean) => emit("update:show", value)
});

const onUpdateShow = (value: boolean) => {
    modelShow.value = value;
};
</script>

<style scoped lang="scss">
:deep(.rs-pane) {
    padding: 8px 0 24px;
}

.rs-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.rs-eyebrow {
    font-family: var(--st-font-mono);
    font-size: 10px;
    letter-spacing: 0.16em;
    color: var(--st-graphite);
}

.rs-title {
    font-family: var(--st-font-display);
    font-size: 22px;
    line-height: 1.2;
    color: var(--st-paper);
}

.rs-current {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 6px 0 4px;
    padding: 8px 0 10px;
    border-bottom: 1px solid var(--st-line);
}

.rs-current-path {
    font-family: var(--st-font-mono);
    font-size: 11px;
    color: var(--st-graphite);
    word-break: break-all;
}

.rs-current-file {
    font-size: 15px;
    font-weight: 400;
    color: var(--st-paper);
    word-break: break-all;
}
</style>
