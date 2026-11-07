<template>
    <n-card content-style="padding: 0.5rem;" @click="emits('click', props.item)">
        <n-flex align="center" style="height: 100%">
            <div class="thumb-box">
                <!-- 文件夹 / 图片 / 压缩包用缩略图；视频与其它类型先留图标 -->
                <thumb-image v-if="thumbPath" :edit-uuid="editUUID" :path="thumbPath" :alt="props.item.name">
                    <n-icon :color="iconColor" size="40">
                        <component :is="icon" />
                    </n-icon>
                </thumb-image>
                <n-icon v-else :color="iconColor" size="40">
                    <component :is="icon" />
                </n-icon>
                <!-- 类型角标：文件夹 / 压缩包只看缩略图容易和图片混淆 -->
                <div class="thumb-kind" :class="`is-${kind}`">{{ kindLabel }}</div>
            </div>

            <n-flex vertical style="flex: 1">
                <n-flex>{{ props.item.name }}</n-flex>
                <n-flex justify="space-between">
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">大小:{{ props.item.sizeStr }}</div>
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">创建:{{ props.item.createTime }}</div>
                </n-flex>
                <n-flex justify="space-between">
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">类型:{{ kindLabel }}<span v-if="props.item.ext"> · {{ props.item.ext }}</span></div>
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">修改:{{ props.item.updateTime }}</div>
                </n-flex>
            </n-flex>
        </n-flex>
    </n-card>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useThemeVars } from "naive-ui";
import { FolderFilled, FileCopyRound } from "@vicons/material";
import { FileZipFilled, FileImageFilled } from "@vicons/antd";
import { ResizeVideo24Filled } from "@vicons/fluent";
import ThumbImage from "@/components/ThumbImage.vue";
import { useViewStore } from "@/stores/view";

const themeVars = useThemeVars();
const viewStore = useViewStore();

const props = defineProps<{
    item: ViewFileType;
}>();

const emits = defineEmits<{
    (e: "click", item: ViewFileType): void;
}>();

const editUUID = computed(() => viewStore.curLibrary?.editUUID ?? "");

/** 需要缩略图的类型；视频暂不取帧，先留图标 */
const thumbPath = computed(() => {
    const item = props.item;
    if (item.isDir || item.extType === "image" || item.extType === "zip") {
        return [...viewStore.shelfPath, item.name].join("/");
    }
    return "";
});

const icon = computed(() => {
    const item = props.item;
    if (item.isDir) {
        return FolderFilled;
    }
    if (item.extType === "image") {
        return FileImageFilled;
    }
    if (item.extType === "video") {
        return ResizeVideo24Filled;
    }
    if (item.extType === "zip") {
        return FileZipFilled;
    }
    return FileCopyRound;
});

const iconColor = computed(() => (
    props.item.isDir || props.item.extType === "video"
        ? themeVars.value.warningColor
        : themeVars.value.infoColor
));

/** 书架上的类型区分：文件夹 / 压缩包 / 视频 / 图片 / 其它文件 */
type ItemKind = "folder" | "zip" | "video" | "image" | "file";

const kind = computed<ItemKind>(() => {
    const item = props.item;
    if (item.isDir) {
        return "folder";
    }
    if (item.extType === "zip") {
        return "zip";
    }
    if (item.extType === "video") {
        return "video";
    }
    if (item.extType === "image") {
        return "image";
    }
    return "file";
});

const KIND_LABELS: Record<ItemKind, string> = {
    folder: "文件夹",
    zip: "压缩包",
    video: "视频",
    image: "图片",
    file: "文件"
};

const kindLabel = computed(() => KIND_LABELS[kind.value]);
</script>

<style scoped>
.thumb-box {
    position: relative;
    width: 5rem;
    height: 5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background-color: rgba(127, 127, 127, 0.08);
    overflow: hidden;
}

/* 角标贴左上角，颜色按类型区分 */
.thumb-kind {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0 5px;
    font-size: 10px;
    line-height: 15px;
    color: #fff;
    border-bottom-right-radius: 6px;
    letter-spacing: 0.02em;
    pointer-events: none;
}

.thumb-kind.is-folder {
    background-color: #e0a12c;
}

.thumb-kind.is-zip {
    background-color: #3f7ede;
}

.thumb-kind.is-video {
    background-color: #b355d6;
}

.thumb-kind.is-image {
    background-color: #35a06a;
}

.thumb-kind.is-file {
    background-color: #7a8391;
}
</style>
