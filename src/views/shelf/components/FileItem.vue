<template>
    <button class="shelf-item" :class="{ 'is-folder': props.item.isDir }" type="button" @click="emits('click', props.item)">
        <span class="shelf-thumb">
            <thumb-image v-if="thumbPath" :edit-uuid="editUUID" :path="thumbPath" :alt="props.item.name">
                <n-icon :size="26"><component :is="icon" /></n-icon>
            </thumb-image>
            <n-icon v-else :size="26"><component :is="icon" /></n-icon>
            <span class="shelf-kind">{{ kindLabel }}</span>
        </span>
        <span class="shelf-main">
            <span class="shelf-name" :title="props.item.name">{{ props.item.name }}</span>
            <span class="shelf-meta" :title="metaTitle">{{ metaText }}</span>
        </span>
    </button>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { FolderFilled, FileCopyRound } from "@vicons/material";
import { BookFilled, FileZipFilled, FileImageFilled } from "@vicons/antd";
import { ResizeVideo24Filled } from "@vicons/fluent";
import ThumbImage from "@/components/ThumbImage.vue";
import { useViewStore, type ShelfFileItem } from "@/stores/view";

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
    if (item.extType === "pdf" || item.extType === "epub" || item.extType === "mobi") {
        return BookFilled;
    }
    return FileCopyRound;
});

/** 书架上的类型区分：文件夹 / 压缩包 / 电子书 / 视频 / 图片 / 其它文件 */
type ItemKind = "folder" | "zip" | "book" | "video" | "image" | "file";

const kind = computed<ItemKind>(() => {
    const item = props.item;
    if (item.isDir) {
        return "folder";
    }
    if (item.extType === "zip") {
        return "zip";
    }
    if (item.extType === "pdf" || item.extType === "epub" || item.extType === "mobi") {
        return "book";
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
    book: "电子书",
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
.shelf-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 68px;
    padding: 6px 8px 6px 6px;
    border: 0;
    border-bottom: 1px solid var(--st-line);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.shelf-item:hover {
    background: var(--st-graphite-wash);
}

/* 朱红只在指向时出现，静态列表保持安静 */
.shelf-item:hover::before {
    content: "";
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 0;
    width: 2px;
    background: var(--st-vermilion);
}

.shelf-item:focus-visible {
    outline: 2px solid var(--st-paper);
    outline-offset: -2px;
}

.shelf-thumb {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border: 1px solid var(--st-line);
    background: var(--st-well);
    color: var(--st-graphite);
    overflow: hidden;
}

.shelf-item.is-folder .shelf-thumb {
    color: var(--st-paper);
}

.shelf-kind {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 0 3px;
    border-top: 1px solid var(--st-line);
    border-left: 1px solid var(--st-line);
    background: var(--st-ink);
    font-family: var(--st-font-mono);
    font-size: 9px;
    line-height: 13px;
    color: var(--st-graphite);
    pointer-events: none;
}

.shelf-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.shelf-name {
    font-size: 15px;
    line-height: 1.35;
    color: var(--st-paper);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.shelf-meta {
    font-family: var(--st-font-mono);
    font-size: 11px;
    line-height: 1.4;
    color: var(--st-graphite);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 桌面一行更舒展，缩略图也更大 */
@media (min-width: 700px) {
    .shelf-item {
        gap: 14px;
        min-height: 76px;
        padding: 8px 10px 8px 8px;
    }

    .shelf-item:hover::before {
        top: 8px;
        bottom: 8px;
    }

    .shelf-thumb {
        width: 60px;
        height: 60px;
    }

    .shelf-name {
        font-size: 16px;
    }
}
</style>
