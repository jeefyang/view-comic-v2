<template>
    <n-flex vertical style="gap: 16px">
        <div class="section">
            <div class="section-title ml-3 mb-1">阅读器</div>
            <n-flex vertical :size="4">
                <XSwitchItem
                    v-model="readerFeatures.pageIndicator"
                    label="显示页码"
                    description="阅读页底部常驻显示「第 N 页 / 共 M 页」"
                />
                <XSwitchItem
                    v-model="readerFeatures.fileName"
                    label="显示文件名"
                    description="在页码上方显示当前压缩包 / 目录的名称"
                />
                <XSwitchItem
                    v-model="readerFeatures.backButton"
                    label="显示返回按钮"
                    description="阅读页左上角显示「返回书架」按钮，和点击区域里的「显示/隐藏 UI」一起控制"
                />
                <XSwitchItem
                    v-model="readerFeatures.progressRestore"
                    label="记住阅读进度"
                    description="刷新或重新打开时，自动跳回上次阅读的位置"
                />
            </n-flex>
        </div>


        <div class="section">
            <div class="section-title ml-3 mb-1">阅读边距</div>
            <div class="spacing-row">
                <span class="spacing-label">上边距</span>
                <n-slider class="spacing-slider" :value="configStore.paddingTop" :min="0" :max="48" :step="1" :tooltip="false" @update:value="(v: number) => setSpacing('paddingTop', v)" />
                <span class="spacing-value">{{ configStore.paddingTop }} px</span>
            </div>
            <div class="spacing-row">
                <span class="spacing-label">下边距</span>
                <n-slider class="spacing-slider" :value="configStore.paddingBottom" :min="0" :max="48" :step="1" :tooltip="false" @update:value="(v: number) => setSpacing('paddingBottom', v)" />
                <span class="spacing-value">{{ configStore.paddingBottom }} px</span>
            </div>
            <div class="spacing-row">
                <span class="spacing-label">左边距</span>
                <n-slider class="spacing-slider" :value="configStore.paddingLeft" :min="0" :max="48" :step="1" :tooltip="false" @update:value="(v: number) => setSpacing('paddingLeft', v)" />
                <span class="spacing-value">{{ configStore.paddingLeft }} px</span>
            </div>
            <div class="spacing-row">
                <span class="spacing-label">右边距</span>
                <n-slider class="spacing-slider" :value="configStore.paddingRight" :min="0" :max="48" :step="1" :tooltip="false" @update:value="(v: number) => setSpacing('paddingRight', v)" />
                <span class="spacing-value">{{ configStore.paddingRight }} px</span>
            </div>
            <div v-if="isWaterfall" class="spacing-row">
                <span class="spacing-label">图片间距</span>
                <n-slider class="spacing-slider" :value="configStore.imageGap" :min="0" :max="48" :step="1" :tooltip="false" @update:value="(v: number) => setSpacing('imageGap', v)" />
                <span class="spacing-value">{{ configStore.imageGap }} px</span>
            </div>
            <div class="spacing-tip">
                <span>{{ isWaterfall ? "上下左右留白 + 图片之间的空隙，灰色区域是背景" : "上下左右留白，切换阅读模式后瀑布流还会多一项「图片间距」" }}</span>
                <n-button size="tiny" quaternary @click="configStore.resetReaderSpacing()">恢复默认</n-button>
            </div>
        </div>
        <div class="section">
            <div class="section-title ml-3 mb-1">双开页</div>
            <XSwitchItem
                v-model="readerSettings.splitSpread"
                label="自动分割双开页"
                description="宽度大于高度的图片拆成左右两屏，瀑布流与单页模式都生效；两屏按同一页码计"
            />
            <template v-if="readerSettings.splitSpread">
                <div class="section-title ml-3 mt-3 mb-1">两屏顺序</div>
                <n-flex vertical :size="4">
                    <XOptionItem
                        v-for="item in directionOptions"
                        :key="item.value"
                        :selected="readerSettings.direction === item.value"
                        :label="item.label"
                        :description="item.description"
                        @select="readerSettings.direction = item.value"
                    />
                </n-flex>
            </template>
        </div>

        <div class="section">
            <div class="section-title ml-3 mb-1">阅读模式</div>
            <n-flex vertical :size="4">
                <XOptionItem
                    v-for="item in modeOptions"
                    :key="item.value"
                    :selected="readerSettings.mode === item.value"
                    :label="item.label"
                    :description="item.description"
                    @select="readerSettings.mode = item.value"
                />
            </n-flex>
        </div>
    </n-flex>
</template>

<script lang="ts" setup>
import XSwitchItem from "@/components/XSwitchItem.vue";
import XOptionItem from "@/components/XOptionItem.vue";
import { readerFeatures } from "@/views/reader/readerFeatures";
import { useConfigStore } from "@/stores/config";
import { computed } from "vue";
import { readerSettings, type PageDirectionType, type ReaderModeType } from "@/views/reader/readerSettings";

const configStore = useConfigStore();

/** 只有瀑布流才有「图片间距」这个概念，单页模式不显示这一行 */
const isWaterfall = computed(() => readerSettings.mode === "waterfall");

/** 拖动即时生效，落云由 store 里的防抖负责，避免每一帧都发请求 */
const setSpacing = (key: "paddingTop" | "paddingBottom" | "paddingLeft" | "paddingRight" | "imageGap", value: number) => {
    configStore[key] = value;
    configStore.saveReaderSpacing();
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

<style scoped lang="scss">
.section-title {
    font-size: 14px;
    opacity: 0.6;
}

.spacing-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 12px;
}

.spacing-label {
    flex: none;
    width: 56px;
    font-size: 13px;
    opacity: 0.78;
}

.spacing-slider {
    flex: 1;
    min-width: 0;
}

.spacing-value {
    flex: none;
    width: 48px;
    text-align: right;
    font-size: 12px;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
}

.spacing-tip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px 0;
    font-size: 12px;
    opacity: 0.55;
}
</style>
