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

            <n-flex vertical style="flex: 1; min-width: 0; gap: 4px">
                <div class="name" :title="props.item.name">{{ props.item.name }}</div>
                <div class="meta" :title="metaTitle">{{ metaText }}</div>
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
import { useViewStore, type ShelfFileItem } from "@/stores/view";

const themeVars = useThemeVars();
const viewStore = useViewStore();

const props = defineProps<{
    item: ShelfFileItem;
}>();

const emits = defineEmits<{
    (e: "click", item: ViewFileType): void;
}>();

const editUUID = computed(() => viewStore.curLibrary?.editUUID ?? "");

/**
 * 缩略图路径跟着条目走（`sortShelfFileList()` 生成列表时就写好了），
 * 不再现算 `[...shelfPath, item.name]` —— 那样点进目录的瞬间旧行会拿新前缀发请求，全是 404。
 */
const thumbPath = computed(() => props.item.thumbPath || "");

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

/** 第二行只放最常看的两项：文件夹看创建时间，文件看大小 + 修改时间 */
const metaText = computed(() => {
    const item = props.item;
    if (item.isDir) {
        return `文件夹 · ${item.createTime || "—"}`;
    }
    return `${item.sizeStr || "—"} · ${item.updateTime || "—"}`;
});

/** 其余信息（类型/扩展名/创建时间）收进 title，鼠标悬停能看到 */
const metaTitle = computed(() => {
    const item = props.item;
    const lines = [`类型：${kindLabel.value}${item.ext ? ` · ${item.ext}` : ""}`];
    if (!item.isDir) {
        lines.push(`大小：${item.sizeStr || "—"}`);
        lines.push(`创建：${item.createTime || "—"}`);
        lines.push(`修改：${item.updateTime || "—"}`);
    }
    return lines.join("\n");
});
</script>

<style scoped>
.name {
    font-size: 0.95rem;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.meta {
    font-size: 0.7rem;
    opacity: 0.55;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: default;
}

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
