<template>
    <div
        ref="mainRef"
        class="main"
        :style="{
            paddingTop: configStore.paddingTop + 'px',
            paddingBottom: configStore.paddingBottom + 'px',
            paddingLeft: configStore.paddingLeft + 'px',
            paddingRight: configStore.paddingRight + 'px'
        }"
    ></div>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { useViewStore } from "@/stores/view";
import { readerSettings } from "@/views/reader/readerSettings";
import { readerPages } from "@/views/reader/readerPages";
import { decodeSize } from "@/utils/decodeSize";
import { buildFileUrl, needsDownscale, SAFE_IMAGE_EDGE, withMaxEdge } from "@/utils/fileUrl";
import { slowNetwork } from "@/utils/network";
import "@/views/reader/components/pageLoading.css";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const viewStore = useViewStore();
const configStore = useConfigStore();
const mainRef = ref<HTMLElement>();

const props = defineProps<{
    jump: number;
}>();

const emits = defineEmits<{
    /** 当前所在页索引变化（0 基） */
    "update:current": [index: number];
}>();

watch(
    () => props.jump,
    (v) => {
        // -1 是「强制重新触发」用的哨兵值（同值时先归零再设回），这里直接忽略
        if (v < 0) {
            return;
        }
        refresh(v);
    }
);
let curScroll = 0;
/** 上次上报给外部的页索引，避免每帧重复触发 */
let lastEmitIndex = -1;
let screenWidth = 0;
let screenHeight = 0;
let sortPageList: WaterfallPageType[] = [];
let displayPageList: WaterfallPageType[] = [];

/** 预加载页数 */
const preloadPageCount = 5;
/** 预加载屏幕数量 */
const preloadScreenCount = 3;

/** 慢网时少占几个并发连接：预加载页数与同时驻留的图片都调小 */
const slowPreloadPageCount = 3;
const slowMaxDisplayPageCount = 5;
/** 加载超过这个时间还没完成，就把提示换成「网络较慢」 */
const SLOW_HINT_DELAY = 3000;
/** 失败后的自动重试间隔（毫秒），次数即数组长度 */
const RETRY_DELAYS = [800, 2000];

let curTopDiv: HTMLDivElement;
let curTopHeight = 0;
let curContentDiv: HTMLDivElement;
let curBottomDiv: HTMLDivElement;
let curBottomHeight = 0;
/** 两个 spacer 的观察器，重建 DOM 前必须 disconnect，否则会一直观察已经移除的节点 */
let topObserver: IntersectionObserver | undefined;
let bottomObserver: IntersectionObserver | undefined;

/** 同时驻留的图片页上限：一张 2000×3000 的图解压后约 24MB，手机上必须限量 */
const maxDisplayPageCount = 8;
/** 每页尺寸探测请求的取消句柄，页被回收时用来中止还没返回的请求 */
const sizeAbortMap = new WeakMap<WaterfallPageType, AbortController>();
/** 已经拿到真实尺寸的页，避免 decodeSize 与 img.onload 重复布局 */
const resolvedPages = new WeakSet<WaterfallPageType>();
/** 已从 DOM 移除的容器，用来忽略移除后迟到的 onload/error（清 src 会触发 error） */
const droppedDivs = new WeakSet<HTMLElement>();
/** 占位层用到的定时器，页被回收时一起清掉 */
const pageTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>[]>();

const trackTimer = (div: HTMLElement, timer: ReturnType<typeof setTimeout>) => {
    const list = pageTimers.get(div);
    if (list) {
        list.push(timer);
    } else {
        pageTimers.set(div, [timer]);
    }
};

const clearPageTimers = (div: HTMLElement) => {
    pageTimers.get(div)?.forEach((timer) => clearTimeout(timer));
    pageTimers.delete(div);
};

/** 重试时换个 query，避免浏览器复用上一次失败的结果 */
const retryUrl = (url: string, attempt: number) => `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;

interface PagePlaceholder {
    onLoad: () => void;
    onFail: () => void;
}

/**
 * 图片加载期间的占位层：转圈 + 文案。
 * 瀑布流的 DOM 是命令式创建的，用不了 SFC，样式来自 pageLoading.css（全局）。
 */
const createPagePlaceholder = (
    div: HTMLDivElement,
    img: HTMLImageElement,
    page: WaterfallPageType,
    downscaleUrl?: string
): PagePlaceholder => {
    const wrap = document.createElement("div");
    wrap.className = "page-loading";
    const spinner = document.createElement("span");
    spinner.className = "page-loading__spinner";
    const text = document.createElement("span");
    text.className = "page-loading__text";
    text.textContent = "加载中";
    wrap.append(spinner, text);
    div.appendChild(wrap);

    const showSlow = () => {
        if (!wrap.isConnected) {
            return;
        }
        wrap.classList.add("is-slow");
        text.textContent = "网络较慢，仍在加载…";
    };
    if (slowNetwork.value) {
        showSlow();
    } else {
        trackTimer(div, setTimeout(showSlow, SLOW_HINT_DELAY));
    }

    let attempt = 0;
    /** 已经改用降采样地址：之后的失败不再退回原图（原图本来就解不动） */
    let usedDownscale = false;

    const onFail = () => {
        if (droppedDivs.has(div)) {
            return;
        }
        if (attempt < RETRY_DELAYS.length) {
            const delay = RETRY_DELAYS[attempt]!;
            attempt += 1;
            text.textContent = "加载失败，正在重试…";
            trackTimer(
                div,
                setTimeout(() => {
                    if (droppedDivs.has(div)) {
                        return;
                    }
                    img.src = retryUrl(page.url, attempt);
                }, delay)
            );
            return;
        }
        // 原地址重试用尽：换成服务端降采样地址再试一次（超大图常见是浏览器解码不了）
        if (downscaleUrl && !usedDownscale) {
            usedDownscale = true;
            attempt = 0;
            wrap.classList.remove("is-failed");
            text.textContent = "图片过大，正在压缩加载…";
            trackTimer(
                div,
                setTimeout(() => {
                    if (droppedDivs.has(div)) {
                        return;
                    }
                    img.src = downscaleUrl;
                }, 300)
            );
            return;
        }
        // 重试用尽：允许用户手动点一次
        wrap.classList.remove("is-slow");
        wrap.classList.add("is-failed");
        text.textContent = "加载失败 · 点击重试";
        console.warn("图片加载失败:", page.url);
    };

    wrap.addEventListener("click", () => {
        if (!wrap.classList.contains("is-failed") || droppedDivs.has(div)) {
            return;
        }
        attempt = 0;
        wrap.classList.remove("is-failed");
        text.textContent = "加载中";
        img.src = usedDownscale && downscaleUrl ? downscaleUrl : retryUrl(page.url, Date.now());
    });

    return {
        onLoad: () => {
            // 图片已经就位，占位层淡出后移除
            wrap.style.opacity = "0";
            trackTimer(
                div,
                setTimeout(() => wrap.remove(), 220)
            );
        },
        onFail
    };
};

const removePage = (page: WaterfallPageType) => {
    // 页已经回收，还没返回的尺寸探测没有意义，直接取消
    sizeAbortMap.get(page)?.abort();
    sizeAbortMap.delete(page);
    if (page.InsertDom) {
        droppedDivs.add(page.InsertDom);
        clearPageTimers(page.InsertDom);
        // 用清空 src 而不是 removeAttribute：前者能让浏览器中止进行中的下载，
        // 后者只是移除属性，请求可能还会继续跑完
        while (page.InsertDom.firstChild) {
            const child = page.InsertDom.firstChild;
            if (child instanceof HTMLImageElement) {
                child.src = "";
            }
            page.InsertDom.removeChild(child);
        }
        page.InsertDom.remove();
        page.InsertDom = undefined;
    }
};

const resetData = () => {
    topObserver?.disconnect();
    topObserver = undefined;
    bottomObserver?.disconnect();
    bottomObserver = undefined;
    if (curTopDiv) {
        curTopDiv.remove();
    }
    if (curBottomDiv) {
        curBottomDiv.remove();
        curBottomDiv = undefined;
    }
    if (curContentDiv) {
        curContentDiv.remove();
        curContentDiv = undefined;
    }
    const main = mainRef.value;
    main.innerHTML = "";

    for (let i = 0; i < sortPageList.length; i++) {
        const item = sortPageList[i];
        removePage(item);
    }
    // DOM 已全部销毁，旧的可视页记录不能留，否则重建时会尝试插到已脱离文档的节点前
    displayPageList = [];
    lastEmitIndex = -1;

    screenWidth = main.clientWidth - configStore.paddingLeft - configStore.paddingRight;
    screenHeight = main.clientHeight - configStore.paddingTop - configStore.paddingBottom;
    // 还没显示过的页没有真实宽高。用整屏高度估算会让累加出的 scroll 偏小（漫画页通常比屏幕高），
    // 所以改用已知页的平均高度；一页都不知道时才退回整屏高度。
    let loadedHeightSum = 0;
    let loadedHeightCount = 0;
    for (const item of readerPages.value) {
        if (item.width && item.height) {
            loadedHeightSum += (screenWidth / item.width) * item.height;
            loadedHeightCount++;
        }
    }
    const estimateHeight = loadedHeightCount ? loadedHeightSum / loadedHeightCount : screenHeight;

    // 双开页（横图）在开启分割时拆成上下两块：每块都铺满宽度，所以单块高度是普通页的两倍。
    // 未知尺寸的页此时无法判断横竖，先按整页排，等它加载出来再触发一次重排。
    // 两图之间的可见空隙。每页上下各留一半，flex 容器里外边距不合并，合起来正好是一个 gap。
    const gap = configStore.imageGap;
    let offset = 0;
    let displayIndex = 0;
    let imageIndex = 0;
    const pages: WaterfallPageType[] = [];
    for (const item of readerPages.value) {
        // 排序后的图片序号：双开页的两半共用同一个序号，页码才不会跳变
        const order = imageIndex++;
        const isLoaded = !!item.width && !!item.height;
        const split = readerSettings.splitSpread && isLoaded && item.width! > item.height!;
        const halves: (0 | 1 | undefined)[] = split ? [0, 1] : [undefined];
        for (const half of halves) {
            const scale = isLoaded ? (half === undefined ? screenWidth / item.width! : (screenWidth * 2) / item.width!) : 1;
            const divHeight = isLoaded ? item.height! * scale : estimateHeight;
            const displayHeight = divHeight + gap;
            pages.push({
                ...item,
                half,
                displayHeight,
                displayWidth: screenWidth,
                divWidth: screenWidth,
                divHeight,
                contentScale: scale,
                loaded: isLoaded,
                url: buildFileUrl(viewStore.curLibrary.editUUID!, item.index, viewStore.comicFileList.basePath),
                scroll: offset,
                // order 是「排序后第几张图」，sortIndex 是「第几屏」（双开页一张图占两屏）
                order,
                sortIndex: displayIndex++
            });
            offset += displayHeight;
        }
    }
    sortPageList = pages;
};

const resetContentDiv = () => {
    curContentDiv = document.createElement("div");
    curContentDiv.className = "contentDiv";
    // 用 flex 列布局让子元素的外边距不再合并：
    // 块级相邻元素的 margin 会合并成一个，而 displayHeight 里是按整份 gap 算的，
    // 两者不一致会让每页累计的 scroll 偏移，页数越多跳转落点越偏。
    curContentDiv.style.display = "flex";
    curContentDiv.style.flexDirection = "column";
    return curContentDiv;
};

let saveTimer: ReturnType<typeof setTimeout> | undefined = undefined;
/**
 * 每张图加载完都要把宽高写回 store。save() 是整份列表的 JSON.stringify，
 * 逐张直写会让首屏十几张图连续做十几次全量序列化，所以合并成一次写。
 */
const saveDebounced = () => {
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
        saveTimer = undefined;
        viewStore.save();
    }, 300);
};

/** 已排好的页里发现横图需要拆成两屏时，等图片加载稳定后重排一次 */
let splitTimer: ReturnType<typeof setTimeout> | undefined = undefined;
let splitIndex = -1;
const scheduleSplitRefresh = (originalIndex: number) => {
    splitIndex = originalIndex;
    if (splitTimer) {
        clearTimeout(splitTimer);
    }
    splitTimer = setTimeout(() => {
        splitTimer = undefined;
        const target = splitIndex;
        splitIndex = -1;
        if (target >= 0) {
            // 停在当前看到的页上重排，不要跳到刚加载出来的那一页
            refresh(currentOriginalIndex());
        }
    }, 200);
};

const updatePage = (page: WaterfallPageType, width: number, height: number) => {
    // 列表可能已按阅读页的规则排过序，不能再按下标取，必须按服务端 index 找
    const item = viewStore.comicFileList.list.find((it) => it.index === page.index);
    if (item) {
        item.width = width;
        item.height = height;
    }
    page.width = width;
    page.height = height;
    page.loaded = true;
    page.divWidth = screenWidth;
    // 双开页的半块铺满宽度，所以是 2 倍缩放
    page.contentScale = page.half === undefined ? screenWidth / width : (screenWidth * 2) / width;
    page.divHeight = height * page.contentScale;
    page.displayHeight = page.divHeight + configStore.imageGap;
    page.displayWidth = screenWidth;
    saveDebounced();
};

const createContentDiv = (page: WaterfallPageType) => {
    const div = document.createElement("div");
    // flex 容器里显式高度不会被压缩，保证实际占位与计算出的 divHeight 一致
    div.style.flex = "0 0 auto";
    div.style.marginTop = configStore.imageGap / 2 + "px";
    div.style.marginBottom = configStore.imageGap / 2 + "px";
    div.style.width = page.divWidth + "px";
    div.style.height = page.divHeight + "px";
    // 占位层用绝对定位盖在图上，容器必须是定位上下文
    div.style.position = "relative";
    // 双开页的半块：图片按两倍宽渲染，容器裁掉另一半
    if (page.half !== undefined) {
        div.style.overflow = "hidden";
    }
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    // 加载完成前透明，避免半张图先糊上来
    img.style.opacity = "0";
    img.style.transition = "opacity 0.2s ease";

    /** 超大图的服务端降采样地址：已知尺寸超线就直接用，未知则失败后退到这里 */
    const downscaleUrl = withMaxEdge(page.url, SAFE_IMAGE_EDGE);
    let downscaleApplied = false;
    const applyDownscaleIfNeeded = (width: number, height: number) => {
        if (downscaleApplied || !needsDownscale(width, height)) {
            return;
        }
        downscaleApplied = true;
        // 首次渲染时 img 还没 src，交给末尾统一赋值
        if (img.src) {
            img.src = downscaleUrl;
        }
    };

    const imgOnload = (width: number, height: number) => {
        // 已从 DOM 移除的容器，迟到的回调一律忽略
        if (droppedDivs.has(div)) {
            return;
        }
        // 同一页只接受第一次真实尺寸：decodeSize 与 img.onload 都会回调，
        // 重复布局会让后面的页 scroll 多累加一次。样式赋值必须照常执行，
        // 页被回收后重新创建时也要设上宽高，否则图片会按原始尺寸溢出。
        if (!resolvedPages.has(page)) {
            resolvedPages.add(page);
            const oldDisplayHeight = page.displayHeight;
            updatePage(page, width, height);
            const deltaHeight = page.displayHeight - oldDisplayHeight;
            for (let n = page.sortIndex + 1; n < sortPageList.length; n++) {
                sortPageList[n].scroll += deltaHeight;
            }
            // 原来是按整页排的，量出来发现是横图：现在才知道该拆，重排一次（有缓存后不会再触发）
            if (readerSettings.splitSpread && page.half === undefined && width > height) {
                scheduleSplitRefresh(page.order ?? 0);
            }
        }
        div.style.width = page.divWidth + "px";
        div.style.height = page.divHeight + "px";

        if (page.half === undefined) {
            img.style.width = page.divWidth + "px";
            img.style.height = page.divHeight + "px";
        } else {
            // 半块：图片宽度是容器的两倍，靠 left 决定露出左半还是右半
            img.style.position = "absolute";
            img.style.top = "0";
            img.style.maxWidth = "none";
            img.style.width = screenWidth * 2 + "px";
            img.style.height = page.divHeight + "px";
            img.style.left = (page.half === 0 ? 0 : -screenWidth) + "px";
        }
        applyDownscaleIfNeeded(width, height);
    };
    if (page.loaded) {
        imgOnload(page.width, page.height);
    } else {
        // 同一张图的两半共用尺寸，优先用已经缓存下来的
        const cached = viewStore.comicFileList.list.find((it) => it.index === page.index);
        if (cached?.width && cached?.height) {
            imgOnload(cached.width, cached.height);
        } else if (slowNetwork.value) {
            // 慢网时不再额外抢一个连接去探尺寸，等 img.onload 自己报
        } else {
            const controller = new AbortController();
            sizeAbortMap.set(page, controller);
            decodeSize(page.url, controller.signal).then(([size, err]) => {
                sizeAbortMap.delete(page);
                if (err || !size) {
                    return;
                }
                imgOnload(size.width, size.height);
            });
        }
    }
    // 占位层与加载逻辑都要在设 src 之前装好：图片命中缓存时 onload 会很快回调
    const placeholder = createPagePlaceholder(div, img, page, downscaleUrl);
    img.onload = () => {
        placeholder.onLoad();
        img.style.opacity = "1";
        imgOnload(img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
        if (droppedDivs.has(div)) {
            return;
        }
        // 失败交给占位层：自动重试两次，仍失败就换降采样地址，再失败给可点击的提示
        placeholder.onFail();
    };
    div.appendChild(img);
    if (needsDownscale(page.width, page.height)) {
        // 尺寸已知且超线：直接要降采样版本，省掉一次注定失败的整图解码
        downscaleApplied = true;
        img.src = downscaleUrl;
    } else {
        img.src = page.url;
    }
    return div;
};

const setDisplayPage = (page: WaterfallPageType) => {
    const start = page.sortIndex;
    const oldStart = displayPageList?.[0]?.sortIndex || 0;
    const newPageList: WaterfallPageType[] = [];
    const oldPageList = [...displayPageList];
    let height = 0;
    const maxScreenHeight = screenHeight * preloadScreenCount;
    // 慢网时少驻留几张，先保证当前页能加载出来
    const displayLimit = slowNetwork.value ? slowMaxDisplayPageCount : maxDisplayPageCount;
    const preloadLimit = slowNetwork.value ? slowPreloadPageCount : preloadPageCount;
    // 同时驻留的 <img> 不超过 maxDisplayPageCount 个，手机上不会因为解码位图过多被杀页
    for (let i = start; i < sortPageList.length && newPageList.length < displayLimit; i++) {
        const item = sortPageList[i];
        height += item.displayHeight;
        if (height <= maxScreenHeight || newPageList.length < preloadLimit) {
            newPageList.push(item);
        }
    }
    for (let i = 0; i < newPageList.length; i++) {
        const page = newPageList[i];
        let index = oldPageList.findIndex((item) => item.sortIndex == page.sortIndex);
        // 找到就不用动
        if (index != -1) {
            continue;
        }
        // 没找到就加入
        // 查找应该插哪个位置前面
        index = [...oldPageList].findIndex((item) => page.sortIndex < item.sortIndex);
        const div = createContentDiv(page);
        page.InsertDom = div;
        if (index == -1) {
            oldPageList.push(page);
            curContentDiv.appendChild(div);
        } else {
            curContentDiv.insertBefore(div, oldPageList[index].InsertDom);
            oldPageList.splice(index, 0, page);
        }

        if (page.sortIndex < oldStart) {
            curTopHeight -= page.displayHeight;
            curTopDiv.style.height = curTopHeight + "px";
        } else {
            curBottomHeight -= page.displayHeight;
            curBottomDiv.style.height = curBottomHeight + "px";
        }
    }
    for (let i = oldPageList.length - 1; i >= 0; i--) {
        const page = oldPageList[i];
        const index = newPageList.findIndex((item) => item.sortIndex == page.sortIndex);
        if (index != -1) {
            continue;
        }
        removePage(page);
        oldPageList.splice(i, 1);
    }
    let topHeight = 0;
    let topIndex = newPageList[0].sortIndex;
    for (let i = 0; i < topIndex; i++) {
        const item = sortPageList[i];

        topHeight += item.displayHeight;
    }
    curTopHeight = topHeight;
    curTopDiv.style.height = curTopHeight + "px";
    let bottomHeight = 0;
    let bottomIndex = newPageList[newPageList.length - 1].sortIndex;
    for (let i = bottomIndex + 1; i < sortPageList.length; i++) {
        const item = sortPageList[i];

        bottomHeight += item.displayHeight;
    }
    curBottomHeight = bottomHeight;
    curBottomDiv.style.height = curBottomHeight + "px";
    displayPageList = [...oldPageList];
};

/** 当前滚动位置所在的页索引，滚过末尾时取最后一页 */
const resolveCurrentIndex = () => {
    const total = sortPageList.length;
    if (total == 0) {
        return 0;
    }
    if (curScroll <= 0) {
        return 0;
    }
    // sortPageList 的 scroll 天然升序，二分找最后一个 scroll <= curScroll 的页。
    // 原来每帧线性扫描，滚动时每个 scroll 事件都要走一遍全部页。
    let low = 0;
    let high = total - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (sortPageList[mid].scroll <= curScroll) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
};

/** 页索引变化时上报给父组件；双开页的两屏共用一个原图索引，所以页码不跳 */
const emitCurrentPage = () => {
    const page = sortPageList[resolveCurrentIndex()];
    if (!page) {
        return;
    }
    if (page.order == lastEmitIndex) {
        return;
    }
    lastEmitIndex = page.order ?? 0;
    emits("update:current", page.order ?? 0);
};

/** 当前所在的是排序后的第几张图（双开页取所在半块的原图页） */
const currentOriginalIndex = () => sortPageList[resolveCurrentIndex()]?.order ?? 0;

const getStart = () => resolveCurrentIndex();

const resetTopDiv = (jump: number) => {
    curTopDiv = document.createElement("div");
    curTopDiv.className = "topDiv";
    let height = 0;
    sortPageList.findIndex((item, index) => {
        if (index === jump) {
            return true;
        }
        height += item.displayHeight;
    });
    curTopHeight = height;
    curTopDiv.style.height = curTopHeight + "px";
    const observer = new IntersectionObserver((entries, objserver) => {
        if (!curTopHeight || curScroll >= curTopHeight) {
            return;
        }
        const start = getStart();
        setDisplayPage(sortPageList[start]);
    });
    topObserver = observer;
    observer.observe(curTopDiv);
    return curTopDiv;
};

const resetBottomDiv = (jump: number) => {
    curBottomDiv = document.createElement("div");
    curBottomDiv.className = "bottomDiv";
    let height = 0;
    sortPageList.forEach((item, index) => {
        if (index < jump) {
            return true;
        }
        height += item.displayHeight;
    });
    curBottomHeight = height;
    curBottomDiv.style.height = curBottomHeight + "px";
    const observer = new IntersectionObserver((entries, objserver) => {
        if (!curBottomHeight) {
            return;
        }
        const start = getStart();
        setDisplayPage(sortPageList[start]);
    });
    bottomObserver = observer;
    observer.observe(curBottomDiv);
    return curBottomDiv;
};

let scrollTime: any = undefined;
let scrollDelay = 300;

/** 上一次完成布局时 main 的尺寸，用来判断是否真的发生了尺寸变化 */
let lastMainWidth = 0;
let lastMainHeight = 0;

const refresh = (jump: number, retry = 0) => {
    const main = mainRef.value;

    if (!main) {
        return;
    }
    // 父容器还没布局完成时尺寸为 0，算出来的占位高度全是 0 会导致跳转落到顶部。
    // 等一帧再试（最多 5 帧），避免 keep-alive 首次激活时的白屏。
    if (main.clientWidth <= 0 || main.clientHeight <= 0) {
        if (retry < 5) {
            requestAnimationFrame(() => refresh(jump, retry + 1));
        }
        return;
    }
    lastMainWidth = main.clientWidth;
    lastMainHeight = main.clientHeight;
    resetData();
    // 外部传进来的是「排序后第几张图」，排好的列表按「屏」算（双开页占两屏），这里换算一次
    let start = sortPageList.findIndex((item) => item.order === jump);
    if (start < 0) {
        start = 0;
    }
    const fragment = document.createDocumentFragment();
    const scrollDiv = document.createElement("div");
    scrollDiv.className = "scrollDiv";
    scrollDiv.addEventListener("scroll", (v) => {
        curScroll = scrollDiv.scrollTop;
        emitCurrentPage();
        if (scrollTime) {
            clearTimeout(scrollTime);
        }
        scrollTime = setTimeout(() => {
            const start = getStart();
            setDisplayPage(sortPageList[start]);
        }, scrollDelay);
    });
    scrollDiv.style.overflow = "auto";
    scrollDiv.style.height = "100%";
    scrollDiv.style.width = "100%";
    scrollDiv.style.scrollbarWidth = "none";
    const topDiv = resetTopDiv(start);
    const contentDiv = resetContentDiv();
    const bottomDiv = resetBottomDiv(start);
    scrollDiv.append(topDiv, contentDiv, bottomDiv);
    fragment.append(scrollDiv);
    main.append(fragment);
    // 先渲染目标页，避免恢复进度时先闪一屏空白
    if (sortPageList[start]) {
        setDisplayPage(sortPageList[start]);
    }
    // 真正滚动的是 scrollDiv，main 只是尺寸容器；
    // 同步定位一次，避免 IntersectionObserver 的首次回调把位置拉回顶部
    scrollDiv.scrollTop = curTopHeight;
    curScroll = scrollDiv.scrollTop;
    emitCurrentPage();
};

let resizeTimer: ReturnType<typeof setTimeout> | undefined = undefined;
/**
 * 窗口缩放 / 手机旋转后，所有页的 displayHeight 与两个 spacer 的高度都不再成立。
 * 记住当前页，重建一次布局并停在同一页上。
 */
const handleResize = () => {
    const main = mainRef.value;
    if (!main) {
        return;
    }
    if (main.clientWidth === lastMainWidth && main.clientHeight === lastMainHeight) {
        return;
    }
    if (resizeTimer) {
        clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
        resizeTimer = undefined;
        if (!sortPageList.length) {
            return;
        }
        refresh(currentOriginalIndex());
    }, 150);
};

let resizeObserver: ResizeObserver | undefined;

// 切换「自动分割双开页」时整份布局都变了，停在当前页重排
watch(
    () => readerSettings.splitSpread,
    () => {
        if (!sortPageList.length) {
            return;
        }
        refresh(currentOriginalIndex());
    }
);

// 改边距 / 图片间距会让所有页的高度和可用宽度都变，同样停在当前页重排
watch(
    () => [configStore.paddingTop, configStore.paddingBottom, configStore.paddingLeft, configStore.paddingRight, configStore.imageGap],
    () => {
        if (!sortPageList.length) {
            return;
        }
        refresh(currentOriginalIndex());
    }
);

onMounted(() => {
    refresh(props.jump || 0);
    if (!mainRef.value) {
        return;
    }
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(mainRef.value);
    } else {
        window.addEventListener("resize", handleResize);
    }
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    window.removeEventListener("resize", handleResize);
    topObserver?.disconnect();
    topObserver = undefined;
    bottomObserver?.disconnect();
    bottomObserver = undefined;
    if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = undefined;
    }
    if (scrollTime) {
        clearTimeout(scrollTime);
        scrollTime = undefined;
    }
    if (splitTimer) {
        clearTimeout(splitTimer);
        splitTimer = undefined;
    }
    // 防抖窗口内离开时把最后一次尺寸写入落盘，避免丢缓存
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        viewStore.save();
    }
});
</script>
<style lang="css" scoped>
.main {
    width: 100%;
    height: 100%;
}
</style>
