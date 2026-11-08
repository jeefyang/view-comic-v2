<template>
    <n-drawer :show="modelShow" placement="bottom" :height="'68%'" @update:show="onUpdateShow">
        <n-drawer-content
            title="阅读设置"
            closable
            :native-scrollbar="false"
            body-content-style="padding: 8px 12px 16px 8px;"
        >
            <div v-if="readingNow" class="current">
                <div class="current-title">正在阅读</div>
                <div class="current-path">{{ readingNow.path }}</div>
                <div class="current-file">{{ readingNow.file }}</div>
            </div>
            <n-tabs v-model:value="tab" type="line" animated justify-content="space-evenly" pane-class="rs-pane">
                <n-tab-pane name="reader" tab="阅读">
                    <settings-reader />
                </n-tab-pane>
                <n-tab-pane v-if="!isWaterfall" name="paged" tab="翻页">
                    <settings-paged />
                </n-tab-pane>
            </n-tabs>
        </n-drawer-content>
    </n-drawer>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { readerSettings } from "@/views/reader/readerSettings";
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
    padding: 12px 4px 24px;
}

.current {
    margin: 0 4px 8px 0;
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
