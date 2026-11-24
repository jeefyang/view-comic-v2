<template>
    <div class="st-scope st-paged">
        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">01</span>
                <h2 class="st-panel-title">适配方式</h2>
                <span class="st-panel-value">{{ fitLabel }}</span>
            </header>
            <p class="st-panel-note">整页怎么放进屏幕。宽度 / 高度适应会超出另一端，按住画面可以拖动查看。</p>
            <div class="st-options st-options--2" role="radiogroup" aria-label="适配方式">
                <label
                    v-for="item in fitModeOptions"
                    :key="item.value"
                    class="st-option st-fit-option"
                    :class="{ 'is-selected': readerSettings.fitMode === item.value, 'is-disabled': isWaterfall }"
                >
                    <input
                        type="radio"
                        name="fit-mode"
                        :value="item.value"
                        :checked="readerSettings.fitMode === item.value"
                        :disabled="isWaterfall"
                        @change="readerSettings.fitMode = item.value"
                    />
                    <FitFigure :mode="item.value" />
                    <span class="st-option-body">
                        <span class="st-option-title">{{ item.label }}</span>
                        <span class="st-option-desc">{{ item.description }}</span>
                    </span>
                </label>
            </div>
            <p v-if="isWaterfall" class="st-panel-note st-panel-note--standalone">
                当前是瀑布流，适配方式暂时不生效；切到单页翻页后立即恢复。
            </p>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">02</span>
                <h2 class="st-panel-title">视频播放按钮</h2>
                <span class="st-panel-value">{{ currentVideoOption.label }}</span>
            </header>
            <p class="st-panel-note">单页模式里遇到 MP4 / WebM，播放与暂停按钮放在画面的哪个位置。</p>
            <div class="st-video-picker">
                <div class="st-video-frame" role="radiogroup" aria-label="播放按钮位置">
                    <label
                        v-for="item in videoPlayPositionOptions"
                        :key="item.value"
                        class="st-video-dot"
                        :class="[`st-video-dot--${positionClass(item.value)}`, { 'is-selected': readerSettings.videoPlayButtonPosition === item.value }]"
                    >
                        <input
                            type="radio"
                            name="video-position"
                            :value="item.value"
                            :checked="readerSettings.videoPlayButtonPosition === item.value"
                            @change="readerSettings.videoPlayButtonPosition = item.value"
                        />
                        <span class="st-sr-only">{{ item.label }}</span>
                    </label>
                </div>
                <div class="st-video-readout">
                    <div class="st-video-readout-title">{{ currentVideoOption.label }}</div>
                    <div class="st-video-readout-desc">{{ currentVideoOption.description }}</div>
                </div>
            </div>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">03</span>
                <h2 class="st-panel-title">点击区域</h2>
                <span class="st-panel-value">{{ tapZones.length }} 个</span>
            </header>
            <p class="st-panel-note">只在单页翻页模式生效。拖动方块移动，选中后用四角 / 四边控制点改大小，松手自动吸附。</p>
            <div class="st-zonetools">
                <div class="st-zonemap" role="img" :aria-label="`当前点击区域：${tapZones.map(zoneLabel).join('，')}`">
                    <div
                        v-for="zone in tapZones"
                        :key="zone.id"
                        class="st-zonemap-zone"
                        :style="zoneStyle(zone)"
                    >
                        <span>{{ zoneLabel(zone) }}</span>
                    </div>
                </div>
                <div class="st-zonetools-info">
                    <div class="st-video-readout-title">按区域分配动作</div>
                    <p class="st-row-desc">翻页、显示 UI、跳页、返回书架，都可以绑到某一块屏幕区域上。</p>
                    <button class="st-btn st-btn--primary" type="button" style="margin-top: 12px" @click="showEditor = true">
                        编辑点击区域
                    </button>
                </div>
            </div>
        </section>

        <TapZoneEditor v-model:show="showEditor" />
    </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import FitFigure from "@/views/settings/components/FitFigure.vue";
import { fitModeOptions } from "@/views/reader/modes/fitStrategies";
import { readerSettings, type VideoPlayPositionType } from "@/views/reader/readerSettings";
import { tapActionLabel } from "@/views/reader/tapZones/actions";
import { loadTapZones, tapZones } from "@/views/reader/tapZones/useTapZones";
import type { TapZone } from "@/views/reader/tapZones/types";
import TapZoneEditor from "@/views/settings/tabs/TapZoneEditor.vue";

const showEditor = ref(false);

const videoPlayPositionOptions: { value: VideoPlayPositionType; label: string; description: string }[] = [
    { value: "bottom-right", label: "右下", description: "按钮显示在视频画面右下角" },
    { value: "bottom-left", label: "左下", description: "按钮显示在视频画面左下角" },
    { value: "top-right", label: "右上", description: "按钮显示在视频画面右上角" },
    { value: "top-left", label: "左上", description: "按钮显示在视频画面左上角" },
    { value: "center", label: "中间", description: "按钮显示在视频画面中央" }
];

const fitLabel = computed(
    () => fitModeOptions.find(item => item.value === readerSettings.fitMode)?.label ?? "自适应"
);

const currentVideoOption = computed(
    () =>
        videoPlayPositionOptions.find(item => item.value === readerSettings.videoPlayButtonPosition) ?? {
            value: "bottom-right" as VideoPlayPositionType,
            label: "右下",
            description: "按钮显示在视频画面右下角"
        }
);

/** 瀑布流模式下适配方式没有意义 */
const isWaterfall = computed(() => readerSettings.mode === "waterfall");

const positionClass = (value: VideoPlayPositionType) => {
    if (value === "top-left") return "tl";
    if (value === "top-right") return "tr";
    if (value === "bottom-left") return "bl";
    if (value === "bottom-right") return "br";
    return "center";
};

/** 区域上显示的短标签，「切换适配方式」带上具体目标模式 */
const zoneLabel = (zone: TapZone) => {
    if (zone.action !== "setFitMode") {
        return tapActionLabel(zone.action);
    }
    const label = fitModeOptions.find(item => item.value === (zone.fitMode ?? "fit"))?.label ?? "自适应";
    return `适配 · ${label}`;
};

const zoneStyle = (zone: TapZone) => ({
    left: `${zone.rect.x * 100}%`,
    top: `${zone.rect.y * 100}%`,
    width: `${zone.rect.width * 100}%`,
    height: `${zone.rect.height * 100}%`
});

onMounted(() => {
    void loadTapZones();
});
</script>
