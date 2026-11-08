<template>
    <div ref="containerRef" class="paged-reader" :class="{ 'is-pannable': pannable }" :style="pagePaddingStyle">
        <div class="page-box">
            <div v-if="page && pageUrl && isSpread" :key="`${pageUrl}-spread`" class="spread-box" :style="spreadBoxStyle">
                <img
                    :src="displayUrl"
                    class="page-img spread-img"
                    :class="{ 'is-loading': loading }"
                    :style="spreadImgStyle"
                    alt=""
                    decoding="async"
                    draggable="false"
                    @load="onImgLoad"
                    @error="onImgError"
                />
            </div>
            <img
                v-else-if="page && pageUrl"
                :key="pageUrl"
                :src="displayUrl"
                class="page-img"
                :class="{ 'is-loading': loading }"
                :style="imgStyle"
                alt=""
                decoding="async"
                draggable="false"
                @load="onImgLoad"
                @error="onImgError"
            />
            <div v-else class="page-empty">没有可显示的页面</div>
            <page-loading
                v-if="page && pageUrl && (loading || failed)"
                :slow="slow"
                :failed="failed"
                :text="loadText"
                @retry="onRetry"
            />
        </div>
        <tap-zone-layer :zones="tapZones" :pannable="pannable" @action="onZoneAction" @pan="onPan" />
    </div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from "vue";
import { useViewStore } from "@/stores/view";
import { useConfigStore } from "@/stores/config";
import { readerPages } from "@/views/reader/readerPages";
import { readerSettings } from "@/views/reader/readerSettings";
import type { ReaderModeHandle } from "@/views/reader/modes/types";
import { computeFit } from "@/views/reader/modes/fitStrategies";
import { decodeSize } from "@/utils/decodeSize";
import { buildFileUrl, needsDownscale, SAFE_IMAGE_EDGE } from "@/utils/fileUrl";
import { slowNetwork } from "@/utils/network";
import { loadTapZones, tapZones } from "@/views/reader/tapZones/useTapZones";
import type { TapActionKey } from "@/views/reader/tapZones/actions";
import type { TapZone } from "@/views/reader/tapZones/types";
import TapZoneLayer from "@/views/reader/components/TapZoneLayer.vue";
import PageLoading from "@/views/reader/components/PageLoading.vue";

/** 加载超过这个时间还没完成，就把提示换成「网络较慢」 */
const SLOW_HINT_DELAY = 3000;
/** 失败后的自动重试间隔（毫秒），次数即数组长度 */
const RETRY_DELAYS = [800, 2000];

const props = defineProps<{ jump: number }>();

const emit = defineEmits<{
    "update:current": [index: number];
    action: [key: TapActionKey];
}>();

const viewStore = useViewStore();
const configStore = useConfigStore();

// 顺序来自 readerPages（按阅读页的排序设置排过），index 是这个数组的下标
const list = computed(() => readerPages.value);
const total = computed(() => list.value.length);

const containerRef = ref<HTMLElement>();
const viewSize = reactive({ width: 0, height: 0 });
/** 每页真实尺寸，按页序号缓存，避免来回翻页重复探测 */
const sizeMap = reactive<Record<string, { width: number; height: number }>>({});

const clampIndex = (i: number) => {
    if (!Number.isFinite(i)) {
        return 0;
    }
    return Math.min(Math.max(0, Math.floor(i)), Math.max(0, total.value - 1));
};

const index = ref(clampIndex(props.jump));
const page = computed(() => list.value[index.value]);

/** 与瀑布流一致的取图地址；`maxEdge` 非空表示要服务端先降采样（超大图） */
const urlOf = (target: typeof page.value, maxEdge?: number) => {
    const editUUID = viewStore.curLibrary?.editUUID;
    if (!target || !editUUID) {
        return "";
    }
    return buildFileUrl(editUUID, target.index, viewStore.comicFileList?.basePath, maxEdge);
};

/** 试过普通地址仍失败后，强制走降采样地址 */
const forceDownscale = ref(false);

/**
 * 该不该降采样：已知尺寸超线就直接降；未知时先按原图试（见 onImgError 的兜底）。
 * 注意 `pageSize` 在下面才定义 —— computed 是惰性求值的，这里引用没问题。
 */
const downscaleEdge = computed<number | undefined>(() => {
    if (forceDownscale.value) {
        return SAFE_IMAGE_EDGE;
    }
    const { width, height } = pageSize.value;
    return needsDownscale(width, height) ? SAFE_IMAGE_EDGE : undefined;
});

const pageUrl = computed(() => urlOf(page.value, downscaleEdge.value));

/* ---------- 加载态：慢网提示 + 失败自动重试 ---------- */
const loading = ref(true);
const failed = ref(false);
const slow = ref(false);
const retrying = ref(false);
/** 换个值就重新请求同一页（重试时用，避免浏览器复用失败结果） */
const retryToken = ref(0);
let attempt = 0;
let hintTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

const displayUrl = computed(() => {
    const base = pageUrl.value;
    if (!base || !retryToken.value) {
        return base;
    }
    return `${base}${base.includes("?") ? "&" : "?"}retry=${retryToken.value}`;
});

const loadText = computed(() => (retrying.value ? "加载失败，正在重试…" : ""));

const clearLoadTimers = () => {
    if (hintTimer) {
        clearTimeout(hintTimer);
        hintTimer = undefined;
    }
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
    }
};

/** 3 秒还没加载完就切成慢网文案 */
const startSlowHint = () => {
    slow.value = slowNetwork.value;
    hintTimer = setTimeout(() => {
        if (loading.value) {
            slow.value = true;
        }
    }, SLOW_HINT_DELAY);
};

const resetLoadState = () => {
    clearLoadTimers();
    loading.value = true;
    failed.value = false;
    retrying.value = false;
    attempt = 0;
    // 换页后重试计数与 token 都归零，别把 ?retry= 带到别的页
    retryToken.value = 0;
    startSlowHint();
};

const onRetry = () => {
    if (!pageUrl.value) {
        return;
    }
    failed.value = false;
    loading.value = true;
    retrying.value = false;
    attempt = 0;
    retryToken.value = Date.now();
    startSlowHint();
};

const sizeKey = (target: typeof page.value) => (target ? String(target.index) : "");

const pageSize = computed(() => {
    const current = page.value;
    if (!current) {
        return { width: 0, height: 0 };
    }
    const cached = sizeMap[sizeKey(current)];
    if (cached) {
        return cached;
    }
    return { width: current.width ?? 0, height: current.height ?? 0 };
});

/** 宽度大于高度即视为双开页（横图） */
const isLandscape = computed(() => {
    const { width, height } = pageSize.value;
    return width > 0 && height > 0 && width > height;
});

const isSpread = computed(() => readerSettings.splitSpread && isLandscape.value);

/** 双开页要按「半页」的尺寸算 */
const fitSize = computed(() => {
    const { width, height } = pageSize.value;
    if (!isSpread.value) {
        return { width, height };
    }
    return { width: width / 2, height };
});

const fit = computed(() => {
    const { width, height } = fitSize.value;
    // 尺寸或视口任一未知就先不摆：computeFit 在这种情况下会退化成 1:1，
    // 表现是「旋转适应不旋转、宽度适应按原尺寸显示（过小）」，等尺寸到了再算。
    if (width <= 0 || height <= 0 || viewSize.width <= 0 || viewSize.height <= 0) {
        return null;
    }
    // rotate 与裁切互相打架，双开页时退化回 contain
    const mode = isSpread.value && readerSettings.fitMode === "rotate" ? "fit" : readerSettings.fitMode;
    return computeFit(width, height, viewSize.width, viewSize.height, mode);
});

/** 双开页当前显示的是第几半：0 = 左半，1 = 右半 */
const half = ref(0);

/** 拖动平移量：宽度/高度适应时图片比视口大，允许拖动查看被裁掉的部分 */
const offset = reactive({ x: 0, y: 0 });

/** 实际占位尺寸（rotate 90 时图片宽高互换）；尺寸未就绪时按 0 处理 */
const renderedSize = computed(() => {
    const f = fit.value;
    if (!f) {
        return { width: 0, height: 0 };
    }
    if (f.rotate) {
        return { width: f.height, height: f.width };
    }
    return { width: f.width, height: f.height };
});

/** 超出视口的量，两侧各一半（flex 居中） */
const overflow = computed(() => ({
    x: Math.max(0, renderedSize.value.width - viewSize.width),
    y: Math.max(0, renderedSize.value.height - viewSize.height)
}));

/** 只有真的超出视口才允许拖动，否则点击区域照旧工作 */
const pannable = computed(() => overflow.value.x > 1 || overflow.value.y > 1);

const clampOffset = () => {
    const maxX = overflow.value.x / 2;
    const maxY = overflow.value.y / 2;
    offset.x = Math.min(Math.max(offset.x, -maxX), maxX);
    offset.y = Math.min(Math.max(offset.y, -maxY), maxY);
};

const resetOffset = () => {
    offset.x = 0;
    offset.y = 0;
};

const onPan = (delta: { dx: number; dy: number }) => {
    if (!pannable.value) {
        return;
    }
    offset.x += delta.dx;
    offset.y += delta.dy;
    clampOffset();
};

/** 换页 / 换半页 / 换适配方式时回到正中 */
watch(
    () => [index.value, half.value, readerSettings.fitMode, readerSettings.splitSpread] as const,
    resetOffset
);

/** 视口或图片尺寸变化后重新夹一次，避免停在越界位置 */
watch(() => [overflow.value.x, overflow.value.y] as const, clampOffset);

const translate = computed(() => `translate3d(${offset.x}px, ${offset.y}px, 0)`);

const spreadBoxStyle = computed(() => {
    const f = fit.value;
    if (!f) {
        return {};
    }
    return {
        width: `${f.width}px`,
        height: `${f.height}px`,
        transform: translate.value
    };
});

const spreadImgStyle = computed(() => {
    const f = fit.value;
    if (!f) {
        return {};
    }
    return {
        width: `${f.width * 2}px`,
        height: `${f.height}px`,
        left: half.value === 1 ? `${-f.width}px` : "0px"
    };
});

const imgStyle = computed(() => {
    const f = fit.value;
    if (!f) {
        // 尺寸未知：先按容器装下整张图，等真实宽高回来再按适配方式摆
        return { maxWidth: "100%", maxHeight: "100%" };
    }
    return {
        width: `${f.width}px`,
        height: `${f.height}px`,
        transform: `${translate.value}${f.rotate ? ` rotate(${f.rotate}deg)` : ""}`
    };
});

/** 已预热的图片，用 src 占位即可让浏览器缓存住 */
const preloaded = new Map<string, HTMLImageElement>();
const MAX_PRELOAD = 5;
/** 慢网时只预热前后各一张，别跟当前页抢带宽 */
const maxPreload = () => (slowNetwork.value ? 2 : MAX_PRELOAD);

/** 预热上限：3000 万像素（约 120MB 位图），超过就跳过，避免为翻页把内存吃穿 */
const PRELOAD_MAX_PIXELS = 30_000_000;

const preloadable = (target: typeof page.value) => {
    if (!target) {
        return false;
    }
    const cached = sizeMap[sizeKey(target)];
    const size = cached ?? (target.width && target.height ? { width: target.width, height: target.height } : undefined);
    if (!size) {
        // 尺寸未知：先允许预热，真正的解码代价由浏览器承担
        return true;
    }
    return size.width * size.height <= PRELOAD_MAX_PIXELS;
};

const ensureSize = (target: typeof page.value) => {
    const key = sizeKey(target);
    if (!target || !key || sizeMap[key]) {
        return;
    }
    if (target.width && target.height) {
        sizeMap[key] = { width: target.width, height: target.height };
        return;
    }
    const url = urlOf(target);
    if (!url) {
        return;
    }
    void decodeSize(url).then(([size]) => {
        if (size) {
            sizeMap[key] = size;
        }
    });
};

const releasePreloaded = () => {
    const first = preloaded.keys().next();
    if (first.done) {
        return;
    }
    const img = preloaded.get(first.value);
    if (img) {
        img.src = "";
    }
    preloaded.delete(first.value);
};

const preloadNearby = () => {
    const targets = [index.value - 1, index.value + 1].filter(i => i >= 0 && i < total.value);
    for (const i of targets) {
        const target = list.value[i];
        if (!target) {
            continue;
        }
        // 超大图不预热：一张 8000 万像素的位图就有 320MB，预热两三张直接把页搞崩
        if (!preloadable(target)) {
            continue;
        }
        const url = urlOf(target);
        if (!url || preloaded.has(url)) {
            continue;
        }
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        preloaded.set(url, img);
        ensureSize(target);
        while (preloaded.size > maxPreload()) {
            releasePreloaded();
        }
    }
};

/** 双开页的阅读顺序跟着翻页方向走：ltr 先左后右，rtl 先右后左 */
const firstHalf = computed(() => (readerSettings.direction === "rtl" ? 1 : 0));
const lastHalf = computed(() => (readerSettings.direction === "rtl" ? 0 : 1));

const next = () => {
    if (isSpread.value && half.value === firstHalf.value) {
        half.value = lastHalf.value;
        return;
    }
    if (index.value < total.value - 1) {
        index.value += 1;
        half.value = firstHalf.value;
    }
};

const prev = () => {
    if (isSpread.value && half.value === lastHalf.value) {
        half.value = firstHalf.value;
        return;
    }
    if (index.value > 0) {
        index.value -= 1;
        half.value = lastHalf.value;
    }
};

const goTo = (target: number) => {
    index.value = clampIndex(target);
};

const getIndex = () => index.value;

defineExpose<ReaderModeHandle>({ next, prev, goTo, getIndex });

watch(
    () => props.jump,
    value => {
        if (value >= 0) {
            index.value = clampIndex(value);
            half.value = firstHalf.value;
        }
    },
    { immediate: true }
);

// 关掉分割或改翻页方向时，回到该页的第一屏，避免停在半页
watch(
    () => [readerSettings.splitSpread, readerSettings.direction] as const,
    () => {
        half.value = firstHalf.value;
    }
);

watch(
    index,
    () => {
        emit("update:current", index.value);
        ensureSize(page.value);
        preloadNearby();
    },
    { immediate: true }
);

const onZoneAction = (zone: TapZone) => {
    const key = zone.action;
    if (key === "setNext") {
        next();
        return;
    }
    if (key === "setPrev") {
        prev();
        return;
    }
    if (key === "setFitMode") {
        // 点击区域直接切适配方式，按住当前模式循环也可以，这里按配置固定切
        readerSettings.fitMode = zone.fitMode ?? "fit";
        return;
    }
    if (key !== "none") {
        emit("action", key);
    }
};

const onImgLoad = (e: Event) => {
    const el = e.target as HTMLImageElement;
    clearLoadTimers();
    loading.value = false;
    failed.value = false;
    retrying.value = false;
    slow.value = false;
    // 图到了说明容器确实有尺寸，这里再量一次，把首帧量空的视口补上
    measure();
    const current = page.value;
    if (!current || sizeMap[sizeKey(current)]) {
        return;
    }
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
        sizeMap[sizeKey(current)] = { width: el.naturalWidth, height: el.naturalHeight };
    }
};

const onImgError = () => {
    if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt]!;
        // 第一次失败按原地址重试；还失败就换成服务端降采样地址（多半是图太大，浏览器解不动）
        const useDownscale = attempt === 1 && !downscaleEdge.value;
        attempt += 1;
        retrying.value = true;
        retryTimer = setTimeout(() => {
            if (useDownscale) {
                forceDownscale.value = true;
            }
            // 换个 token 重新设 src，等于重试这一页
            retryToken.value = Date.now();
        }, delay);
        return;
    }
    // 自动重试用尽，交给占位层显示「点击重试」
    clearLoadTimers();
    loading.value = false;
    failed.value = true;
    retrying.value = false;
};

// 换页时重置加载态
watch(pageUrl, () => resetLoadState(), { immediate: true });

// 换了页就清掉「强制降采样」，别把上一页的兜底带到新页
watch(() => index.value, () => {
    forceDownscale.value = false;
});

const onKeydown = (e: KeyboardEvent) => {
    // 翻页方向只管双开页的左右先后，不影响「下一页」的方向键语义
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        prev();
    }
};

let resizeObserver: ResizeObserver | undefined;

/** 阅读边距：和瀑布流共用同一份配置，单页模式也跟着收缩可用区域 */
const pagePaddingStyle = computed(() => ({
    paddingTop: configStore.paddingTop + "px",
    paddingBottom: configStore.paddingBottom + "px",
    paddingLeft: configStore.paddingLeft + "px",
    paddingRight: configStore.paddingRight + "px"
}));

let measureAttempt = 0;

/** 首帧容器可能还没尺寸（缓存页恢复 / 抽屉动画中），量到 0 就隔帧再试几次 */
const scheduleMeasure = () => {
    if (measureAttempt >= 10) {
        return;
    }
    measureAttempt += 1;
    requestAnimationFrame(measure);
};

const measure = () => {
    const el = containerRef.value;
    if (!el) {
        scheduleMeasure();
        return;
    }
    const rect = el.getBoundingClientRect();
    // getBoundingClientRect 含 padding，可用区域要减掉，否则图片会顶到边距里
    const width = Math.max(0, Math.round(rect.width) - configStore.paddingLeft - configStore.paddingRight);
    const height = Math.max(0, Math.round(rect.height) - configStore.paddingTop - configStore.paddingBottom);
    if (width <= 0 || height <= 0) {
        scheduleMeasure();
        return;
    }
    measureAttempt = 0;
    viewSize.width = width;
    viewSize.height = height;
};

watch(
    () => [configStore.paddingTop, configStore.paddingBottom, configStore.paddingLeft, configStore.paddingRight],
    () => measure()
);

onMounted(() => {
    measure();
    void loadTapZones();
    if (typeof ResizeObserver !== "undefined" && containerRef.value) {
        resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(containerRef.value);
    }
    window.addEventListener("keydown", onKeydown);
});

onActivated(() => {
    measure();
    window.addEventListener("keydown", onKeydown);
});

onDeactivated(() => {
    window.removeEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    clearLoadTimers();
    window.removeEventListener("keydown", onKeydown);
    for (const img of preloaded.values()) {
        img.src = "";
    }
    preloaded.clear();
});
</script>

<style lang="scss" scoped>
.paged-reader {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #000;
    touch-action: pinch-zoom;
}

.page-box {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.page-img {
    display: block;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    will-change: transform;
    transition: opacity 0.2s ease;
}

/* 图片还没解码出来时先透明，避免闪半张图 */
.page-img.is-loading {
    opacity: 0;
}

/* 图片比视口大时提示可以拖动 */
.paged-reader.is-pannable {
    cursor: grab;
}

.paged-reader.is-pannable:active {
    cursor: grabbing;
}

/* 双开页：外层按半页尺寸裁切，内部图片 200% 宽、按当前半页平移 */
.spread-box {
    position: relative;
    overflow: hidden;
    will-change: transform;
}

.spread-img {
    position: absolute;
    top: 0;
    max-width: none;
}

.page-empty {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
}
</style>
