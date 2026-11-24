<template>
    <div class="hist-item">
        <button class="hist-open" type="button" @click="emit('open', props.item)">
            <span class="hist-thumb">
                <thumb-image :edit-uuid="props.item.editUUID" :path="thumbPath" :alt="props.item.name">
                    <n-icon :size="24"><FileImageFilled /></n-icon>
                </thumb-image>
            </span>
            <span class="hist-main">
                <span class="hist-title">{{ title }}</span>
                <span class="hist-path" :title="pathText">{{ pathText }}</span>
                <span class="hist-meta">{{ pageText }} · {{ timeText }}</span>
            </span>
        </button>
        <button class="hist-del" type="button" title="从历史里删除" @click="emit('remove', props.item.id)">
            <n-icon :size="16"><TrashOutline /></n-icon>
        </button>
    </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { FileImageFilled } from "@vicons/antd";
import { TrashOutline } from "@vicons/ionicons5";
import ThumbImage from "@/components/ThumbImage.vue";
import { formatRelativeTime, historyPageText } from "../historyData";

const props = defineProps<{
    item: ReadHistoryBookItemType;
}>();

const emit = defineEmits<{
    (e: "open", item: ReadHistoryBookItemType): void;
    (e: "remove", id: string): void;
}>();

/** 书的缩略图：路径就是书本身（压缩包 / 目录），书库根下的书退回用书名 */
const thumbPath = computed(() => props.item.basePath || props.item.name);

const title = computed(() => props.item.name);

/** 书在书库里的路径，连同书库名一起显示，方便认出是哪一本 */
const pathText = computed(() => {
    const path = props.item.basePath || "根目录";
    return props.item.libraryName ? `${props.item.libraryName} / ${path}` : path;
});

const pageText = computed(() => historyPageText(props.item) || "未记录页码");

const timeText = computed(() => formatRelativeTime(props.item.openTime));
</script>
