<template>
    <n-drawer :show="modelShow" placement="bottom" :height="'68%'" @update:show="onUpdateShow">
        <n-drawer-content
            title="阅读设置"
            closable
            :native-scrollbar="false"
            body-content-style="padding: 8px 12px 16px 8px;"
        >
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

const SettingsReader = defineAsyncComponent(() => import("@/views/settings/tabs/SettingsReader.vue"));
const SettingsPaged = defineAsyncComponent(() => import("@/views/settings/tabs/SettingsPaged.vue"));

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ "update:show": [show: boolean] }>();

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
</style>
