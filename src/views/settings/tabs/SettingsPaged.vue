<template>
    <n-flex vertical style="gap: 16px">
        <div class="section">
            <div class="section-title ml-3 mb-1">适配方式</div>
            <div v-if="isWaterfall" class="tip ml-3 mb-1">瀑布流模式下不适用，切到单页翻页后生效</div>
            <n-flex vertical :size="4">
                <XOptionItem
                    v-for="item in fitModeOptions"
                    :key="item.value"
                    :selected="readerSettings.fitMode === item.value"
                    :label="item.label"
                    :description="item.description"
                    :disabled="isWaterfall"
                    @select="readerSettings.fitMode = item.value"
                />
            </n-flex>
        </div>

        <div class="section">
            <div class="section-title ml-3 mb-1">视频播放按钮</div>
            <div class="tip ml-3 mb-1">单页视频页的播放/暂停按钮位置</div>
            <n-flex vertical :size="4">
                <XOptionItem
                    v-for="item in videoPlayPositionOptions"
                    :key="item.value"
                    :selected="readerSettings.videoPlayButtonPosition === item.value"
                    :label="item.label"
                    :description="item.description"
                    @select="readerSettings.videoPlayButtonPosition = item.value"
                />
            </n-flex>
        </div>

        <div class="section">
            <div class="section-title ml-3 mb-1">点击区域</div>
            <div class="tip ml-3 mb-1">当前 {{ tapZones.length }} 个区域，仅在单页翻页模式生效</div>
            <XBlockButton class="btn" @click="showEditor = true">编辑点击区域</XBlockButton>
        </div>

        <TapZoneEditor v-model:show="showEditor" />
    </n-flex>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import XOptionItem from "@/components/XOptionItem.vue";
import XBlockButton from "@/components/XBlockButton.vue";
import { readerSettings, type VideoPlayPositionType } from "@/views/reader/readerSettings";
import { fitModeOptions } from "@/views/reader/modes/fitStrategies";
import { loadTapZones, tapZones } from "@/views/reader/tapZones/useTapZones";
import TapZoneEditor from "@/views/settings/tabs/TapZoneEditor.vue";

const showEditor = ref(false);

const videoPlayPositionOptions: { value: VideoPlayPositionType; label: string; description: string }[] = [
    { value: "bottom-right", label: "右下", description: "按钮显示在视频画面右下角" },
    { value: "bottom-left", label: "左下", description: "按钮显示在视频画面左下角" },
    { value: "top-right", label: "右上", description: "按钮显示在视频画面右上角" },
    { value: "top-left", label: "左上", description: "按钮显示在视频画面左上角" },
    { value: "center", label: "中间", description: "按钮显示在视频画面中央" }
];

/** 瀑布流模式下适配方式没有意义 */
const isWaterfall = computed(() => readerSettings.mode === "waterfall");

onMounted(() => {
    void loadTapZones();
});
</script>

<style scoped lang="scss">
.section-title {
    font-size: 14px;
    opacity: 0.6;
}

.tip {
    font-size: 12px;
    opacity: 0.6;
}

.btn {
    font-size: large;
    margin-top: 4px;
}
</style>
