<template>
    <div ref="listContainer" class="virtual-list-container" @scroll="handleScroll" :style="{ height: containerHeight + 'px' }">
        <div class="virtual-list-phantom" :style="{ height: totalHeight + 'px' }"></div>

        <div class="virtual-list-content" :style="{ transform: `translate3d(0, ${startOffset}px, 0)` }">
            <div v-for="item in visibleData" :key="item._index" :data-index="item._index" class="virtual-list-item" :ref="(el) => setItemRef(el, item._index)">
                <slot :item="item" :index="item._index"></slot>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, type ComponentPublicInstance } from "vue";
export interface VirtualListInstance {
    scrollToIndex: (index: number) => Promise<void>;
    getScrollState: () => { index: number; offset: number } | null;
    restorePosition: (index: number, offset: number) => Promise<void>;
}
// ========================
// 类型声明与导出
// ========================
interface PositionCache {
    index: number;
    height: number;
    top: number;
    bottom: number;
}

interface Props {
    listData: T[]; // 列表数据源
    containerHeight?: number; // 可视区高度，默认 600
    estimatedItemHeight?: number; // 预估平均高度，默认 80
    bufferScale?: number; // 上下缓冲区比例（1代表上下各缓存一屏），默认 1
}

const props = withDefaults(defineProps<Props>(), {
    containerHeight: 600,
    estimatedItemHeight: 80,
    bufferScale: 1
});

// ========================
// 核心状态 Refs
// ========================
const listContainer = ref<HTMLElement | null>(null);
const positions = ref<PositionCache[]>([]);
const start = ref<number>(0);
const end = ref<number>(0);
const startOffset = ref<number>(0);
/**
 * 最后一次真实滚动位置。页面被 keep-alive 移出文档时浏览器会把 scrollTop 清零，
 * 快照必须仍能拿到用户离开时的位置，否则「从阅读页回到书架」会停在顶部。
 */
let lastScrollTop = 0;

const itemRefs = new Map<number, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;

// ========================
// 初始化与位置更新逻辑
// ========================
const initPositions = () => {
    positions.value = props.listData.map((_, index) => ({
        index,
        height: props.estimatedItemHeight,
        top: index * props.estimatedItemHeight,
        bottom: (index + 1) * props.estimatedItemHeight
    }));
    // 同一份容器里换列表（排序 / 过滤）时保持当前滚动位置；新挂载的容器 scrollTop 是 0
    const container = listContainer.value;
    lastScrollTop = container?.isConnected ? container.scrollTop : 0;
    start.value = binarySearch(positions.value, lastScrollTop);
    const visibleCount = Math.ceil(props.containerHeight / props.estimatedItemHeight);
    end.value = start.value + visibleCount;
    updateOffset();
};

const updateItemSize = (index: number, height: number) => {
    const oldHeight = positions.value[index]?.height;
    if (oldHeight === undefined) {
        return;
    }
    // 页面被移出文档 / 藏起来时 ResizeObserver 会报 0 尺寸；把它写进缓存会把整张位置表算塌
    if (height <= 0) {
        return;
    }
    const dValue = height - oldHeight;

    if (dValue === 0) return; // 高度无变化，忽略

    // 1. 更新当前项及其后所有项的缓存坐标
    positions.value[index].height = height;
    positions.value[index].bottom += dValue;

    for (let i = index + 1; i < positions.value.length; i++) {
        positions.value[i].top = positions.value[i - 1].bottom;
        positions.value[i].bottom += dValue;
    }

    // 2. 滚动补偿机制：防止上方图片加载导致当前视口内容跳动
    if (index < start.value && listContainer.value) {
        listContainer.value.scrollTop += dValue;
    } else {
        updateOffset();
    }
};

const updateOffset = () => {
    const bufferCount = Math.ceil(props.containerHeight / props.estimatedItemHeight) * props.bufferScale;
    const actualStart = Math.max(0, start.value - bufferCount);

    if (actualStart >= 1) {
        startOffset.value = positions.value[actualStart - 1].bottom;
    } else {
        startOffset.value = 0;
    }
};

const setItemRef = (el: Element | ComponentPublicInstance | null, index: number) => {
    if (el) {
        const node = el as HTMLElement;
        itemRefs.set(index, node);
        resizeObserver?.observe(node);
    }
};

// ========================
// 滚动计算逻辑
// ========================
const totalHeight = computed<number>(() => {
    return positions.value.length ? positions.value[positions.value.length - 1].bottom : 0;
});

const visibleData = computed<(T & { _index: number })[]>(() => {
    const visibleCount = Math.ceil(props.containerHeight / props.estimatedItemHeight);
    const bufferCount = visibleCount * props.bufferScale;

    const startIndex = Math.max(0, start.value - bufferCount);
    const endIndex = Math.min(props.listData.length, end.value + bufferCount);

    return props.listData.slice(startIndex, endIndex).map((item, idx) => ({
        ...item,
        _index: startIndex + idx
    }));
});

const binarySearch = (list: PositionCache[], value: number): number => {
    let start = 0;
    let end = list.length - 1;
    let tempIndex: number | null = null;

    while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const midValue = list[mid].bottom;

        if (midValue === value) return mid + 1;
        if (midValue < value) {
            start = mid + 1;
        } else {
            if (tempIndex === null || mid < tempIndex) tempIndex = mid;
            end = mid - 1;
        }
    }
    return tempIndex ?? 0;
};

const handleScroll = () => {
    if (!listContainer.value) return;
    // 被 keep-alive 移出文档时浏览器会把 scrollTop 清零，可能还附带一次 scroll 事件；
    // 那不是用户操作，忽略它，否则记下的位置和 start 会被一起冲掉
    if (!listContainer.value.isConnected) return;
    const scrollTop = listContainer.value.scrollTop;
    lastScrollTop = scrollTop;

    start.value = binarySearch(positions.value, scrollTop);
    const visibleCount = Math.ceil(props.containerHeight / props.estimatedItemHeight);
    end.value = start.value + visibleCount;

    updateOffset();
};

// ========================
// 暴露方法：外部调用 API
// ========================

// 1. 精准跳转
const scrollToIndex = async (index: number) => {
    if (!listContainer.value || index < 0 || index >= positions.value.length) return;
    listContainer.value.scrollTop = positions.value[index].top;

    await nextTick();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!listContainer.value) return;
            const correctedTop = positions.value[index].top;
            if (Math.abs(listContainer.value.scrollTop - correctedTop) > 1) {
                listContainer.value.scrollTop = correctedTop;
            }
        });
    });
};

// 2. 获取当前滚动状态（防刷新记忆）
const getScrollState = () => {
    if (!listContainer.value || positions.value.length === 0) return null;
    // 移出文档后 scrollTop 已经不是用户离开时的值，改用最后一次真实滚动位置
    const scrollTop = listContainer.value.isConnected ? listContainer.value.scrollTop : lastScrollTop;
    const index = Math.min(start.value, positions.value.length - 1);
    const position = positions.value[index];
    if (!position) return null;
    const offset = scrollTop - position.top;
    return { index, offset };
};

// 3. 恢复滚动状态
const restorePosition = async (index: number, offset: number = 0) => {
    if (!listContainer.value || index < 0 || index >= positions.value.length) return;
    listContainer.value.scrollTop = positions.value[index].top + offset;

    await nextTick();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!listContainer.value) return;
            const correctedTop = positions.value[index].top + offset;
            listContainer.value.scrollTop = correctedTop;
        });
    });
};

defineExpose({ scrollToIndex, getScrollState, restorePosition });

// ========================
// 生命周期与监听器
// ========================
watch(() => props.listData, initPositions, { immediate: true });

onMounted(() => {
    // 使用 requestAnimationFrame 节流批量处理重排
    resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        window.requestAnimationFrame(() => {
            for (const entry of entries) {
                const target = entry.target as HTMLElement;
                const indexStr = target.getAttribute("data-index");
                if (indexStr !== null) {
                    const index = Number(indexStr);
                    const height = entry.contentRect.height;
                    if (index >= 0) updateItemSize(index, height);
                }
            }
        });
    });
    handleScroll();
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    itemRefs.clear();
});
</script>

<style scoped>
.virtual-list-container {
    overflow-y: auto;
    position: relative;
    -webkit-overflow-scrolling: touch;
    /* 解决因浏览器自动锚定导致的剧烈闪烁问题 */
    overflow-anchor: none;
    scrollbar-width: none;
}
.virtual-list-phantom {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: -1;
}
.virtual-list-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    will-change: transform;
}
.virtual-list-item {
    box-sizing: border-box;
}
</style>
