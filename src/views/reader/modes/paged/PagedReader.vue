<template>
    <div ref="containerRef" class="paged-reader" :class="{ 'is-pannable': pannable }" :style="pagePaddingStyle">
        <div class="page-box">
            <div v-if="page && pageUrl && isSpread" :key="`${pageUrl}-spread`" class="spread-box" :style="spreadBoxStyle">
                <video
                    v-if="isVideo"
                    :key="`${displayUrl}-${half}-video`"
                    ref="videoEl"
                    :src="displayUrl"
                    class="page-img spread-img"
                    :class="{ 'is-loading': loading }"
                    :style="spreadImgStyle"
                    muted
                    loop
                    playsinline
                    webkit-playsinline
                    preload="metadata"
                    @loadedmetadata="onVideoLoadedMetadata"
                    @canplay="onVideoCanPlay"
                    @play="onVideoPlay"
                    @pause="onVideoPause"
                    @error="onVideoError"
                ></video>
                <img
                    v-else
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
            <video
                v-else-if="page && pageUrl && isVideo"
                :key="`${displayUrl}-${half}-video`"
                ref="videoEl"
                :src="displayUrl"
                class="page-img"
                :class="{ 'is-loading': loading }"
                :style="imgStyle"
                muted
                loop
                playsinline
                webkit-playsinline
                preload="metadata"
                @loadedmetadata="onVideoLoadedMetadata"
                @canplay="onVideoCanPlay"
                @play="onVideoPlay"
                @pause="onVideoPause"
                @error="onVideoError"
            ></video>
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
        <button
            v-if="isVideo && pageUrl && !loading && !failed"
            type="button"
            class="video-play-btn"
            :class="`is-${readerSettings.videoPlayButtonPosition}`"
            :aria-label="videoPlaying ? '暂停视频' : '播放视频'"
            @click.stop="toggleVideo"
        >
            {{ videoPlaying ? "❚❚" : "▶" }}
        </button>
    </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from "vue";
import { useViewStore } from "@/stores/view";
import { useConfigStore } from "@/stores/config";
import { readerPages } from "@/views/reader/readerPages";
import { readerSettings } from "@/views/reader/readerSettings";
import type { ReaderModeHandle } from "@/views/reader/modes/types";
import { computeFit } from "@/views/reader/modes/fitStrategies";
import { decodeSize } from "@/utils/decodeSize";
import { buildFileUrl } from "@/utils/fileUrl";
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
/** 每页真实尺寸，按页文件名缓存：换排序后 index 会指向别的图，用序号会串号 */
const sizeMap = reactive<Record<string, { width: number; height: number }>>({});

// 换书（basePath 变了）就把尺寸缓存清空，别让上一本的尺寸串过来
watch(
    () => viewStore.comicFileList?.basePath,
    () => {
        for (const key of Object.keys(sizeMap)) {
            delete sizeMap[key];
        }
    }
);

const clampIndex = (i: number) => {
    if (!Number.isFinite(i)) {
        return 0;
    }
    return Math.min(Math.max(0, Math.floor(i)), Math.max(0, total.value - 1));
};

const index = ref(clampIndex(props.jump));
const page = computed(() => list.value[index.value]);
/** 视频页只做播放器，不进入图片尺寸探测与预取链路 */
const isVideo = computed(() => page.value?.extType === "video");

/** 与瀑布流一致的取图地址 */
const urlOf = (target: typeof page.value) => {
    const editUUID = viewStore.curLibrary?.editUUID;
    if (!target || !editUUID) {
        return "";
    }
    return buildFileUrl(editUUID, target.index, viewStore.comicFileList?.basePath);
};

const pageUrl = computed(() => urlOf(page.value));

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

/** 缓存键用文件名；没有名字时才退回序号 */
const sizeKey = (target: typeof page.value) => (target ? target.name || String(target.index) : "");

const rawPageSize = computed(() => {
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

/** 视频在 metadata 回来前没有真实尺寸，先按 16:9 占位 */
const hasRealVideoSize = computed(() => {
    if (!isVideo.value) {
        return true;
    }
    const { width, height } = rawPageSize.value;
    return width > 0 && height > 0;
});

const pageSize = computed(() => {
    const raw = rawPageSize.value;
    if (isVideo.value && (!raw.width || !raw.height)) {
        return { width: 16, height: 9 };
    }
    return raw;
});

/** 宽度大于高度即视为双开页（横图）；视频尺寸未知时先不拆 */
const isLandscape = computed(() => {
    if (isVideo.value && !hasRealVideoSize.value) {
        return false;
    }
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
    // rotate 与裁切互相打架，双开页时退化回 contain
    const mode = isSpread.value && readerSettings.fitMode === "rotate" ? "fit" : readerSettings.fitMode;
    return computeFit(fitSize.value.width, fitSize.value.height, viewSize.width, viewSize.height, mode);
});

/** 双开页当前显示的是第几半：0 = 左半，1 = 右半 */
const half = ref(0);

/** 拖动平移量：宽度/高度适应时图片比视口大，允许拖动查看被裁掉的部分 */
const offset = reactive({ x: 0, y: 0 });

/** 实际占位尺寸（rotate 90 时图片宽高互换） */
const renderedSize = computed(() => {
    const { width, height, rotate } = fit.value;
    if (rotate) {
        return { width: height, height: width };
    }
    return { width, height };
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

const spreadBoxStyle = computed(() => ({
    width: `${fit.value.width}px`,
    height: `${fit.value.height}px`,
    transform: translate.value
}));

const spreadImgStyle = computed(() => ({
    width: `${fit.value.width * 2}px`,
    height: `${fit.value.height}px`,
    left: half.value === 1 ? `${-fit.value.width}px` : "0px"
}));

const imgStyle = computed(() => {
    const { width, height, rotate } = fit.value;
    if (width <= 0 || height <= 0) {
        // 尺寸未知时先按原生大小显示，等 load 回调补上尺寸
        return { maxWidth: "100%", maxHeight: "100%" };
    }
    return {
        width: `${width}px`,
        height: `${height}px`,
        transform: `${translate.value}${rotate ? ` rotate(${rotate}deg)` : ""}`
    };
});

/** 已预热的图片，用 src 占位即可让浏览器缓存住 */
const preloaded = new Map<string, HTMLImageElement>();
const MAX_PRELOAD = 5;
/** 慢网时只预热前后各一张，别跟当前页抢带宽 */
const maxPreload = () => (slowNetwork.value ? 2 : MAX_PRELOAD);

const ensureSize = (target: typeof page.value) => {
    // 视频的尺寸来自 loadedmetadata，不能用图片的 Range + imageSize 探测
    if (!target || target.extType === "video") {
        return;
    }
    const key = sizeKey(target);
    if (!key || sizeMap[key]) {
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
        if (!target || target.extType === "video") {
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
    const current = page.value;
    if (!current) {
        return;
    }
    // 真图尺寸永远最权威：每次都覆写，缓存里就算有错值也能被纠正过来
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
        const key = sizeKey(current);
        const prev = sizeMap[key];
        if (!prev || prev.width !== el.naturalWidth || prev.height !== el.naturalHeight) {
            sizeMap[key] = { width: el.naturalWidth, height: el.naturalHeight };
        }
    }
};

const onImgError = () => {
    if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt]!;
        attempt += 1;
        retrying.value = true;
        retryTimer = setTimeout(() => {
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

/* ---------- 视频播放 ---------- */
const videoEl = ref<HTMLVideoElement>();
const videoPlaying = ref(false);
/** 用户主动暂停后，换页/重新可见时不要自动续播 */
const videoUserPaused = ref(false);
/** 当前是否「想要播放」：play() 是异步的，用它压住点击暂停的竞态 */
const videoWanted = ref(false);
let playRequest = 0;

const markVideoReady = () => {
    clearLoadTimers();
    loading.value = false;
    failed.value = false;
    retrying.value = false;
    slow.value = false;
};

const pauseVideo = () => {
    playRequest += 1;
    videoWanted.value = false;
    const el = videoEl.value;
    if (el && !el.paused) {
        el.pause();
    }
    videoPlaying.value = false;
};

const tryAutoPlay = async () => {
    if (!isVideo.value || videoUserPaused.value) {
        return;
    }
    const el = videoEl.value;
    if (!el) {
        return;
    }
    const token = ++playRequest;
    videoWanted.value = true;
    try {
        await el.play();
    } catch {
        // 自动播放被拦截时保留按钮，让用户手动点
        if (token === playRequest) {
            videoWanted.value = false;
        }
    }
    if (token !== playRequest) {
        // 期间用户点了暂停，或已经换到别的视频
        if (!videoWanted.value) {
            el.pause();
        }
        return;
    }
    if (!videoWanted.value) {
        el.pause();
    }
};

const toggleVideo = () => {
    const el = videoEl.value;
    if (!el) {
        return;
    }
    if (videoWanted.value || !el.paused) {
        videoUserPaused.value = true;
        pauseVideo();
        return;
    }
    videoUserPaused.value = false;
    void tryAutoPlay();
};

const onVideoLoadedMetadata = (e: Event) => {
    const el = e.target as HTMLVideoElement;
    if (el !== videoEl.value) {
        return;
    }
    markVideoReady();
    const current = page.value;
    if (current && el.videoWidth > 0 && el.videoHeight > 0) {
        const key = sizeKey(current);
        const prev = sizeMap[key];
        if (!prev || prev.width !== el.videoWidth || prev.height !== el.videoHeight) {
            sizeMap[key] = { width: el.videoWidth, height: el.videoHeight };
        }
    }
    void tryAutoPlay();
};

const onVideoCanPlay = (e: Event) => {
    if (e.target !== videoEl.value) {
        return;
    }
    markVideoReady();
    void tryAutoPlay();
};

const onVideoPlay = (e: Event) => {
    if (e.target !== videoEl.value) {
        return;
    }
    videoPlaying.value = true;
};

const onVideoPause = (e: Event) => {
    if (e.target !== videoEl.value) {
        return;
    }
    videoWanted.value = false;
    videoPlaying.value = false;
};

const onVideoError = (e: Event) => {
    if (e.target !== videoEl.value) {
        return;
    }
    onImgError();
};

// 换页时重置加载态；视频页同时把播放状态归零，等新元素挂载后自动播放
watch(
    pageUrl,
    () => {
        pauseVideo();
        videoUserPaused.value = false;
        resetLoadState();
        if (isVideo.value) {
            void nextTick(() => tryAutoPlay());
        }
    },
    { immediate: true }
);

// 双开页换半屏时 video 按 key 重建，重新从头播
watch(half, () => {
    if (!isVideo.value) {
        return;
    }
    pauseVideo();
    videoUserPaused.value = false;
    void nextTick(() => tryAutoPlay());
});

// 视频 metadata 回来后可能才知道是横屏，拆半屏会让 video 分支重建
watch(isSpread, () => {
    if (!isVideo.value) {
        return;
    }
    pauseVideo();
    videoUserPaused.value = false;
    void nextTick(() => tryAutoPlay());
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

const measure = () => {
    const el = containerRef.value;
    if (!el) {
        return;
    }
    const rect = el.getBoundingClientRect();
    // getBoundingClientRect 含 padding，可用区域要减掉，否则图片会顶到边距里
    viewSize.width = Math.max(0, Math.round(rect.width) - configStore.paddingLeft - configStore.paddingRight);
    viewSize.height = Math.max(0, Math.round(rect.height) - configStore.paddingTop - configStore.paddingBottom);
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
    if (isVideo.value) {
        void nextTick(() => tryAutoPlay());
    }
});

onDeactivated(() => {
    window.removeEventListener("keydown", onKeydown);
    pauseVideo();
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    clearLoadTimers();
    pauseVideo();
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

/* 视频页播放/暂停按钮：z-index 必须高于 tap-zone-layer */
.video-play-btn {
    position: absolute;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    backdrop-filter: blur(2px);
}

.video-play-btn.is-top-left {
    top: calc(12px + env(safe-area-inset-top, 0px));
    left: calc(12px + env(safe-area-inset-left, 0px));
}

.video-play-btn.is-bottom-left {
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    left: calc(12px + env(safe-area-inset-left, 0px));
}

.video-play-btn.is-top-right {
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
}

.video-play-btn.is-bottom-right {
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
}

.video-play-btn.is-center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

.page-empty {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
}
</style>
