<template>
    <div class="hist-item">
        <button class="hist-open" type="button" @click="emit('open', props.item)">
            <span class="hist-thumb">
                <thumb-image :edit-uuid="props.item.editUUID" :path="thumbPath" :alt="props.item.pageName">
                    <n-icon :size="24"><BookmarkOutline /></n-icon>
                </thumb-image>
            </span>
            <span class="hist-main">
                <span class="hist-title">{{ props.item.pageName || `第 ${props.item.page} 页` }}</span>
                <span class="hist-path" :title="pathText">{{ pathText }}</span>
                <span class="hist-meta">第 {{ props.item.page }} 页 · {{ timeText }}</span>
            </span>
        </button>
        <button class="hist-del" type="button" title="删除这个书签" @click="emit('remove', props.item.id)">
            <n-icon :size="16"><TrashOutline /></n-icon>
        </button>
    </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
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

/** 书签跟着「书」取缩略图（书本身 = basePath），取不到就用书签图标兜底 */
const thumbPath = computed(() => props.item.basePath || props.item.name);

/** 书在书库里的路径，连同书库名一起显示，方便认出是哪一本 */
const pathText = computed(() => {
    const path = props.item.basePath || "根目录";
    return props.item.libraryName ? `${props.item.libraryName} / ${path}` : path;
});

const timeText = computed(() => formatRelativeTime(props.item.createTime));
</script>
