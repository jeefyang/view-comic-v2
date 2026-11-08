<template>
    <n-card content-style="padding: 0.5rem;" @click="emit('open', props.item)">
        <n-flex align="center" style="height: 100%">
            <div class="thumb-box">
                <n-icon size="34" :color="themeVars.warningColor">
                    <LibraryOutline />
                </n-icon>
            </div>
            <n-flex vertical style="flex: 1; min-width: 0">
                <div class="title">{{ props.item.libraryName || "未命名书库" }}</div>
                <div class="sub">{{ props.item.pathUrl || "—" }}</div>
                <div class="sub">{{ timeText }}</div>
            </n-flex>
            <n-button quaternary circle size="tiny" title="从历史里删除" @click.stop="emit('remove', props.item.id)">
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
import { LibraryOutline, TrashOutline } from "@vicons/ionicons5";
import { formatRelativeTime } from "../historyData";

const props = defineProps<{
    item: ReadHistoryLibraryItemType;
}>();

const emit = defineEmits<{
    (e: "open", item: ReadHistoryLibraryItemType): void;
    (e: "remove", id: string): void;
}>();

const themeVars = useThemeVars();

const timeText = computed(() => formatRelativeTime(props.item.openTime));
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
</style>
