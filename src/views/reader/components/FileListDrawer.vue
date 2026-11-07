<!-- 阅读页的文件列表：按不同规则排序后浏览、点选跳转 -->
<template>
    <n-drawer :show="show" width="86%" placement="right" @update:show="onShow">
        <n-drawer-content :native-scrollbar="false" closable>
            <template #header>
                <div class="fl-header">
                    <span>文件列表</span>
                    <span class="fl-count">{{ rows.length }} 页</span>
                </div>
            </template>
            <div class="fl-sort">
                <n-button
                    v-for="item in readerSortOptions"
                    :key="item.value"
                    size="small"
                    :type="readerSort.type === item.value ? 'primary' : 'default'"
                    @click="readerSort.type = item.value"
                >
                    {{ item.label }}
                </n-button>
                <n-button size="small" @click="toggleReaderSortOrder()">
                    {{ readerSort.order === 1 ? "正序 ↑" : "反序 ↓" }}
                </n-button>
            </div>
            <div class="fl-list">
                <n-virtual-list ref="listRef" :items="rows" :item-size="44">
                    <template #default="{ item }">
                        <div
                            class="fl-item"
                            :class="{ 'is-current': item.no - 1 === current }"
                            @click="onJump(item.no - 1)"
                        >
                            <span class="fl-index">{{ item.no }}</span>
                            <span class="fl-name">{{ item.name }}</span>
                            <span v-if="readerSort.type === 'updateTime'" class="fl-time">{{ formatTime(item.updateTime) }}</span>
                        </div>
                    </template>
                </n-virtual-list>
            </div>
        </n-drawer-content>
    </n-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { readerSort, readerSortOptions, toggleReaderSortOrder } from "@/views/reader/readerSort";

const props = withDefaults(
    defineProps<{
        show: boolean;
        /** 当前页在 pages 里的下标 */
        current: number;
        pages: ComicFileType[];
    }>(),
    { current: 0 }
);

const emit = defineEmits<{
    "update:show": [value: boolean];
    /** 点选某一页 */
    jump: [index: number];
}>();

const listRef = ref<any>(null);

/** 序号自己算：虚拟列表的插槽里拿不到可靠的下标，直接预生成更稳 */
const rows = computed(() => props.pages.map((item, index) => ({ ...item, no: index + 1 })));

const onShow = (value: boolean) => {
    emit("update:show", value);
};

const onJump = (index: number) => {
    emit("jump", index);
};

const pad = (value: number) => String(value).padStart(2, "0");

/** updateTime 是时间字符串（服务端给的），只在按时间排序时显示 */
const formatTime = (value?: number | string) => {
    if (!value) {
        return "";
    }
    if (typeof value === "number") {
        const date = new Date(value);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    return String(value).slice(0, 10);
};

/** 打开时滚到当前页附近，避免每次从第一页开始找 */
watch(
    () => props.show,
    (value) => {
        if (!value) {
            return;
        }
        nextTick(() => {
            listRef.value?.scrollTo?.({ index: Math.max(props.current - 2, 0) });
        });
    }
);
</script>

<style scoped>
.fl-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 16px;
}

.fl-count {
    font-size: 12px;
    opacity: 0.55;
}

.fl-sort {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 0 10px;
}

.fl-list {
    height: calc(100vh - 132px);
}

.fl-item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 6px;
    border-radius: var(--border-radius, 4px);
    cursor: pointer;
}

.fl-item:hover {
    background-color: var(--divider-color, rgba(128, 128, 128, 0.12));
}

.fl-item.is-current {
    background-color: var(--divider-color, rgba(128, 128, 128, 0.12));
    font-weight: 600;
}

.fl-index {
    flex: 0 0 40px;
    text-align: right;
    font-size: 12px;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
}

.fl-name {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.fl-time {
    flex: 0 0 auto;
    font-size: 12px;
    opacity: 0.55;
}
</style>
