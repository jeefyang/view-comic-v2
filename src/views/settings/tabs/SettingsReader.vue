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
import { readerSettings, type PageDirectionType, type ReaderModeType } from "@/views/reader/readerSettings";

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
</style>
