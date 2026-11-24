<template>
    <div class="hist-item">
        <button class="hist-open" type="button" @click="emit('open', props.item)">
            <span class="hist-thumb">
                <n-icon :size="24"><LibraryOutline /></n-icon>
            </span>
            <span class="hist-main">
                <span class="hist-title">{{ props.item.libraryName || "未命名书库" }}</span>
                <span class="hist-path">{{ props.item.pathUrl || "—" }}</span>
                <span class="hist-meta">{{ timeText }}</span>
            </span>
        </button>
        <button class="hist-del" type="button" title="从历史里删除" @click="emit('remove', props.item.id)">
            <n-icon :size="16"><TrashOutline /></n-icon>
        </button>
    </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { LibraryOutline, TrashOutline } from "@vicons/ionicons5";
import { formatRelativeTime } from "../historyData";

const props = defineProps<{
    item: ReadHistoryLibraryItemType;
}>();

const emit = defineEmits<{
    (e: "open", item: ReadHistoryLibraryItemType): void;
    (e: "remove", id: string): void;
}>();

const timeText = computed(() => formatRelativeTime(props.item.openTime));
</script>
