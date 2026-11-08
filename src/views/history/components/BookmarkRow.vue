<template>
    <n-card content-style="padding: 0.5rem;" @click="emit('open', props.item)">
        <n-flex align="center" style="height: 100%">
            <div class="thumb-box">
                <thumb-image :edit-uuid="props.item.editUUID" :path="thumbPath" :alt="props.item.pageName">
                    <n-icon size="34" :color="themeVars.successColor">
                        <BookmarkOutline />
                    </n-icon>
                </thumb-image>
            </div>
            <n-flex vertical style="flex: 1; min-width: 0">
                <div class="title">{{ props.item.pageName || `第 ${props.item.page} 页` }}</div>
                <div class="sub path" :title="pathText">{{ pathText }}</div>
                <div class="sub">
                    <span>第 {{ props.item.page }} 页</span>
                    <span class="dot">·</span>
                    <span>{{ timeText }}</span>
                </div>
            </n-flex>
            <n-button quaternary circle size="tiny" title="删除这个书签" @click.stop="emit('remove', props.item.id)">
                <template #icon>
                    <n-icon>
                        <TrashOutline />
                    </n-icon>
                </template>
            </n-button>
        </n-flex>
    </n-card>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useThemeVars } from "naive-ui";
import { BookmarkOutline, TrashOutline } from "@vicons/ionicons5";
import ThumbImage from "@/components/ThumbImage.vue";
import { formatRelativeTime } from "../historyData";

const props = defineProps<{
    item: BookmarkItemType;
}>();

const emit = defineEmits<{
    (e: "open", item: BookmarkItemType): void;
    (e: "remove", id: string): void;
}>();

const themeVars = useThemeVars();

/** 书签跟着「书」取缩略图（书本身 = basePath），取不到就用书签图标兜底 */
const thumbPath = computed(() => props.item.basePath || props.item.name);

/** 书在书库里的路径，连同书库名一起显示，方便认出是哪一本 */
const pathText = computed(() => {
    const path = props.item.basePath || "根目录";
    return props.item.libraryName ? `${props.item.libraryName} / ${path}` : path;
});

const timeText = computed(() => formatRelativeTime(props.item.createTime));
</script>

<style scoped>
.thumb-box {
    width: 4rem;
    height: 4rem;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background-color: rgba(127, 127, 127, 0.08);
    overflow: hidden;
}

.title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.sub {
    font-size: 0.72rem;
    opacity: 0.65;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

/* 路径这一行用等宽字体，斜杠分隔的层级更好认 */
.path {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    opacity: 0.5;
}

.dot {
    margin: 0 4px;
}
</style>
