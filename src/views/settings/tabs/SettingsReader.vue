<template>
    <div class="st-scope st-reader">
        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">01</span>
                <h2 class="st-panel-title">阅读模式</h2>
                <span class="st-panel-value">{{ modeLabel }}</span>
            </header>
            <p class="st-panel-note">先定怎么翻页，再调留白。瀑布流适合条漫与长图，单页适合整页画稿。</p>
            <div class="st-options st-options--2" role="radiogroup" aria-label="阅读模式">
                <label
                    v-for="item in modeOptions"
                    :key="item.value"
                    class="st-option"
                    :class="{ 'is-selected': readerSettings.mode === item.value }"
                >
                    <input
                        type="radio"
                        name="reader-mode"
                        :value="item.value"
                        :checked="readerSettings.mode === item.value"
                        @change="readerSettings.mode = item.value"
                    />
                    <span class="st-option-mark" aria-hidden="true"></span>
                    <span class="st-option-body">
                        <span class="st-option-title">{{ item.label }}</span>
                        <span class="st-option-desc">{{ item.description }}</span>
                    </span>
                </label>
            </div>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">02</span>
                <h2 class="st-panel-title">版式与边距</h2>
                <span class="st-panel-value">{{ isWaterfall ? "含图片间距" : "四向留白" }}</span>
            </header>
            <p class="st-panel-note">拖动滑块，左侧试片会同步重画；停手半秒后写入云端。</p>
            <div class="st-proof">
                <PagePlate
                    :top="configStore.paddingTop"
                    :bottom="configStore.paddingBottom"
                    :left="configStore.paddingLeft"
                    :right="configStore.paddingRight"
                    :gap="isWaterfall ? configStore.imageGap : null"
                    :split="readerSettings.splitSpread"
                    :direction="readerSettings.direction"
                    :active-edge="activeEdge"
                />
                <div class="st-proof-controls">
                    <SettingRange
                        :model-value="configStore.paddingTop"
                        label="上边距"
                        edge="top"
                        @update:model-value="(v: number) => setSpacing('paddingTop', v)"
                        @edge="activeEdge = $event"
                    />
                    <SettingRange
                        :model-value="configStore.paddingBottom"
                        label="下边距"
                        edge="bottom"
                        @update:model-value="(v: number) => setSpacing('paddingBottom', v)"
                        @edge="activeEdge = $event"
                    />
                    <SettingRange
                        :model-value="configStore.paddingLeft"
                        label="左边距"
                        edge="left"
                        @update:model-value="(v: number) => setSpacing('paddingLeft', v)"
                        @edge="activeEdge = $event"
                    />
                    <SettingRange
                        :model-value="configStore.paddingRight"
                        label="右边距"
                        edge="right"
                        @update:model-value="(v: number) => setSpacing('paddingRight', v)"
                        @edge="activeEdge = $event"
                    />
                    <SettingRange
                        v-if="isWaterfall"
                        :model-value="configStore.imageGap"
                        label="图片间距"
                        @update:model-value="(v: number) => setSpacing('imageGap', v)"
                    />
                </div>
            </div>
            <div class="st-panel-foot">
                <span>
                    {{ isWaterfall ? "深色区域是背景，试片里的白线是图片之间的空隙。" : "单页模式只留四向空白；切到瀑布流后还会多一项「图片间距」。" }}
                </span>
                <button class="st-btn st-btn--ghost" type="button" @click="configStore.resetReaderSpacing()">恢复默认</button>
            </div>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">03</span>
                <h2 class="st-panel-title">画面显示</h2>
            </header>
            <div class="st-list" style="margin-top: 6px">
                <SettingSwitch
                    v-model="readerFeatures.pageIndicator"
                    label="显示页码"
                    description="阅读页底部常驻显示「第 N 页 / 共 M 页」"
                />
                <SettingSwitch
                    v-model="readerFeatures.fileName"
                    label="显示文件名"
                    description="在页码上方显示当前压缩包 / 目录的名称"
                />
                <SettingSwitch
                    v-model="readerFeatures.backButton"
                    label="显示返回按钮"
                    description="阅读页左上角显示「返回书架」，和点击区域里的「显示 / 隐藏 UI」一起控制"
                />
                <SettingSwitch
                    v-model="readerFeatures.progressRestore"
                    label="记住阅读进度"
                    description="刷新或重新打开时，自动跳回上次阅读的位置"
                />
            </div>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">04</span>
                <h2 class="st-panel-title">预加载</h2>
                <span class="st-panel-value">弱网自动下调</span>
            </header>
            <p class="st-panel-note">填得越大，翻页越顺，同时解码的大图也越多。没有硬上限，按设备量力而行。</p>
            <div class="st-list">
                <div class="st-row">
                    <div class="st-row-main">
                        <label class="st-row-title" for="preload-waterfall">瀑布流</label>
                        <p class="st-row-desc">当前页之后提前加载的页数；同时驻留页数不少于它</p>
                    </div>
                    <div class="st-num-wrap">
                        <input
                            id="preload-waterfall"
                            class="st-num"
                            type="number"
                            inputmode="numeric"
                            :min="WATERFALL_PRELOAD.min"
                            step="1"
                            :value="readerSettings.waterfallPreload"
                            @change="onWaterfallPreload"
                        />
                        <span class="st-unit">页</span>
                    </div>
                </div>
                <div class="st-row">
                    <div class="st-row-main">
                        <label class="st-row-title" for="preload-paged">单页前后</label>
                        <p class="st-row-desc">当前页前后各预加载的页数</p>
                    </div>
                    <div class="st-num-wrap">
                        <input
                            id="preload-paged"
                            class="st-num"
                            type="number"
                            inputmode="numeric"
                            :min="PAGED_PRELOAD.min"
                            step="1"
                            :value="readerSettings.pagedPreload"
                            @change="onPagedPreload"
                        />
                        <span class="st-unit">页</span>
                    </div>
                </div>
            </div>
            <div v-if="preloadHeavy" class="st-alert" role="status" aria-live="polite">
                <svg class="st-alert-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 1.6 15 14.4H1L8 1.6Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
                    <path d="M8 6v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                    <circle cx="8" cy="12.1" r="0.7" fill="currentColor" />
                </svg>
                <div class="st-alert-body">
                    <strong class="st-alert-title">预加载偏大</strong>
                    会同时解码更多大图，手机可能卡顿或内存吃紧。建议瀑布流不超过
                    {{ WATERFALL_PRELOAD.recommendedMax }} 页、单页前后不超过 {{ PAGED_PRELOAD.recommendedMax }} 页。
                </div>
            </div>
            <div class="st-panel-foot">
                <span>预加载只影响缓存与响应速度，不会改变画质。</span>
                <button class="st-btn st-btn--ghost" type="button" @click="resetPreload">恢复默认</button>
            </div>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">05</span>
                <h2 class="st-panel-title">双开页</h2>
                <span class="st-panel-value">{{ readerSettings.splitSpread ? directionLabel : "关闭" }}</span>
            </header>
            <div class="st-list" style="margin-top: 6px">
                <SettingSwitch
                    v-model="readerSettings.splitSpread"
                    label="自动分割双开页"
                    description="宽度大于高度的图片拆成左右两屏，瀑布流与单页模式都生效；两屏按同一页码计"
                />
            </div>
            <div v-if="readerSettings.splitSpread" class="st-direction">
                <p class="st-panel-note st-panel-note--standalone">两张半页的先后顺序</p>
                <div class="st-options st-options--2" role="radiogroup" aria-label="双开页顺序">
                    <label
                        v-for="item in directionOptions"
                        :key="item.value"
                        class="st-option"
                        :class="{ 'is-selected': readerSettings.direction === item.value }"
                    >
                        <input
                            type="radio"
                            name="page-direction"
                            :value="item.value"
                            :checked="readerSettings.direction === item.value"
                            @change="readerSettings.direction = item.value"
                        />
                        <span class="st-option-mark" aria-hidden="true"></span>
                        <span class="st-option-body">
                            <span class="st-option-title">{{ item.label }}</span>
                            <span class="st-option-desc">{{ item.description }}</span>
                        </span>
                    </label>
                </div>
            </div>
        </section>
    </div>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import SettingRange from "@/views/settings/components/SettingRange.vue";
import SettingSwitch from "@/views/settings/components/SettingSwitch.vue";
import PagePlate from "@/views/settings/components/PagePlate.vue";
import type { PlateEdge } from "@/views/settings/components/plateTypes";
import { readerFeatures } from "@/views/reader/readerFeatures";
import { useConfigStore } from "@/stores/config";
import {
    readerSettings,
    WATERFALL_PRELOAD,
    PAGED_PRELOAD,
    normalizeWaterfallPreload,
    normalizePagedPreload,
    type PageDirectionType,
    type ReaderModeType
} from "@/views/reader/readerSettings";

const configStore = useConfigStore();

/** 只有瀑布流才有「图片间距」这个概念，单页模式不显示这一行 */
const isWaterfall = computed(() => readerSettings.mode === "waterfall");

const modeLabel = computed(() => (isWaterfall.value ? "瀑布流" : "单页翻页"));

const directionLabel = computed(() => (readerSettings.direction === "rtl" ? "从右到左" : "从左到右"));

/** 当前悬停 / 聚焦的边距，对应试片上的一条高亮带 */
const activeEdge = ref<PlateEdge>(null);

/** 拖动即时生效，落云由 store 里的防抖负责，避免每一帧都发请求 */
const setSpacing = (key: "paddingTop" | "paddingBottom" | "paddingLeft" | "paddingRight" | "imageGap", value: number) => {
    configStore[key] = value;
    configStore.saveReaderSpacing();
};

/** 超过建议值时给醒目提醒；不硬性禁止，用户可以按自己的设备情况调 */
const preloadHeavy = computed(
    () => readerSettings.waterfallPreload > WATERFALL_PRELOAD.recommendedMax || readerSettings.pagedPreload > PAGED_PRELOAD.recommendedMax
);

const onWaterfallPreload = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const next = normalizeWaterfallPreload(input.value);
    readerSettings.waterfallPreload = next;
    input.value = String(next);
};

const onPagedPreload = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const next = normalizePagedPreload(input.value);
    readerSettings.pagedPreload = next;
    input.value = String(next);
};

/** 只把预加载两项恢复默认，不动阅读模式等其它选择 */
const resetPreload = () => {
    readerSettings.waterfallPreload = WATERFALL_PRELOAD.fallback;
    readerSettings.pagedPreload = PAGED_PRELOAD.fallback;
};

const modeOptions: { value: ReaderModeType; label: string; description: string }[] = [
    { value: "waterfall", label: "瀑布流", description: "连续滚动，适合条漫与长图" },
    { value: "paged", label: "单页翻页", description: "一次一页，支持点击区域与键盘翻页" }
];

/** 只在开启「自动分割双开页」时才有意义，所以跟它放在同一节 */
const directionOptions: { value: PageDirectionType; label: string; description: string }[] = [
    { value: "ltr", label: "从左到右", description: "先看左半页，再看右半页" },
    { value: "rtl", label: "从右到左", description: "日漫习惯，先看右半页，再看左半页" }
];
</script>
