<template>
    <div ref="mainRef" class="main" :style="{ padding: configStore.padding + 'px' }"></div>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { useViewStore } from "@/stores/view";
import { c } from "naive-ui";
import { onMounted, ref, watch } from "vue";

const viewStore = useViewStore();
const configStore = useConfigStore();
const mainRef = ref<HTMLElement>();

const props = defineProps<{
    jump: number;
}>();

watch(
    () => props.jump,
    (v) => {
        refresh(v);
    }
);
let curScroll = 0;
let curScrollType: -1 | 1 = 1;
let screenWidth = 0;
let screenHeight = 0;
let pageList: WaterfallPageType[] = [];
let sortPageList: WaterfallPageType[] = [];
let displayPageList: WaterfallPageType[] = [];

/** 预加载页数 */
const preloadPageCount = 5;
/** 预加载屏幕数量 */
const preloadScreenCount = 3;
/** 最大预加载 */
const maxPreloadCount = 20;

let curTopDiv: HTMLDivElement;
let curTopHeight = 0;
let curContentDiv: HTMLDivElement;
let curBottomDiv: HTMLDivElement;
let curBottomHeight = 0;
const updateDisplayPageList = (scrollType: -1 | 1) => {};

const resetSortPageList = () => {
    sortPageList = [...pageList];
};

const removePage = (page: WaterfallPageType) => {
    if (page.InsertDom) {
        page.InsertDom.removeAttribute("src");
        if (page.InsertDom.children.length > 0) {
            for (let j = 0; j < page.InsertDom.children.length; j++) {
                const child = page.InsertDom.children[j];
                child.removeAttribute("src");
                child.remove();
            }
        }
        page.InsertDom.remove();
        page.InsertDom = undefined;
    }
    if (page.prelodDom) {
        page.prelodDom.removeAttribute("src");
        if (page.prelodDom.children.length > 0) {
            for (let j = 0; j < page.prelodDom.children.length; j++) {
                const child = page.prelodDom.children[j];
                child.removeAttribute("src");
                child.remove();
            }
        }
        page.prelodDom.remove();
        page.prelodDom = undefined;
    }
};

const resetData = () => {
    if (curTopDiv) {
        curTopDiv.remove();
        top = undefined;
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

    screenWidth = main.clientWidth - configStore.padding * 2;
    screenHeight = main.clientHeight - configStore.padding * 2;
    let curScroll = 0;
    pageList = viewStore.comicFileList.list.map((item, index) => {
        const width = item.width;
        const height = item.height;
        const isLoaded = !!item.width && !!item.height;
        const contentWidth = isLoaded ? screenWidth : screenWidth;
        const contentHeight = isLoaded ? (screenWidth / width) * height : screenHeight;
        const displayWidth = contentWidth;
        const displayHeight = contentHeight + configStore.pageMargin * 2;

        curScroll += displayHeight;
        return {
            ...item,
            width: item.width,
            height: item.height,
            loaded: !!width && !!height,
            displayHeight,
            displayWidth,
            contentWidth,
            contentHeight,
            url: `api/file/${viewStore.curLibrary.editUUID!}/${item.index}/${viewStore.comicFileList.basePath}`,
            scroll: curScroll - displayHeight,
            sortIndex: index
        };
    });
    resetSortPageList();
};

const resetContentDiv = () => {
    curContentDiv = document.createElement("div");
    curContentDiv.className = "contentDiv";
    return curContentDiv;
};

const updatePage = (page: WaterfallPageType, width: number, height: number) => {
    viewStore.comicFileList.list[page.index].width = width;
    viewStore.comicFileList.list[page.index].height = height;
    viewStore.save();
    page.width = width;
    page.height = height;
    page.loaded = true;
    page.contentWidth = screenWidth;
    page.contentHeight = (screenWidth / width) * height;
    page.displayHeight = page.contentHeight + configStore.pageMargin * 2;
    page.displayWidth = screenWidth;
    viewStore.save();
};

const setDisplayPage = (page: WaterfallPageType) => {
    const start = page.sortIndex;
    const oldStart = displayPageList?.[0]?.sortIndex || 0;
    const newPageList: WaterfallPageType[] = [];
    const oldPageList = [...displayPageList];
    let height = 0;
    let maxScreenHeight = screenHeight * preloadScreenCount;
    let count = 0;
    for (let i = start; i < sortPageList.length; i++) {
        const item = sortPageList[i];
        height += item.displayHeight;
        if (height <= maxScreenHeight || count < preloadPageCount) {
            newPageList.push(item);
            count++;
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
        index = [...oldPageList].reverse().findIndex((item) => page.sortIndex < item.sortIndex);
        const div = document.createElement("div");
        div.style.marginTop = configStore.pageMargin + "px";
        div.style.marginBottom = configStore.pageMargin + "px";
        div.style.width = page.contentWidth + "px";
        div.style.height = page.contentHeight + "px";
        const img = new Image();
        img.src = page.url;
        img.onload = () => {
            // if (page.loaded) {
            //     return;
            // }
            const width = img.width;
            const height = img.height;
            const oldDisplayHeight = page.displayHeight;
            updatePage(page, width, height);
            const deltaHeight = page.displayHeight - oldDisplayHeight;
            for (let n = page.sortIndex + 1; n < sortPageList.length; n++) {
                sortPageList[n].scroll += deltaHeight;
            }
            page.width = width;
            page.height = height;
            viewStore.comicFileList.list[page.index].width = width;
            viewStore.comicFileList.list[page.index].height = height;
            viewStore.save();
            div.style.width = page.contentWidth + "px";
            img.style.width = page.contentWidth + "px";
            div.style.height = page.contentHeight + "px";
            img.style.height = page.contentHeight + "px";
            page.loaded = true;
        };
        div.appendChild(img);
        page.InsertDom = div;
        if (index == -1) {
            oldPageList.push(page);
            curContentDiv.appendChild(div);
            console.log("push")
        } else {
            console.log('insert')
            const pageIndex = oldPageList[index].sortIndex;
            oldPageList.splice(index, 0, page);
            curContentDiv.insertBefore(div, displayPageList[pageIndex].InsertDom);
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
    console.log(
        page.sortIndex,
        displayPageList.map((c) => c.sortIndex)
    );
};

const getStart = (scrollTtype: -1 | 1) => {
    const index = sortPageList.findIndex((item, index) => {
        return curScroll >= item.scroll && curScroll <= item.scroll + item.displayHeight;
    });
    return index == -1 ? 0 : index;
};

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
        const start = getStart(-1);
        console.log("top",start);
        setDisplayPage(sortPageList[start]);
    });
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
        const start = getStart(1);
        console.log("bottom");
        setDisplayPage(sortPageList[start]);
    });
    observer.observe(curBottomDiv);
    return curBottomDiv;
};

let scrollTime: any = undefined;
let scrollDelay = 300;

const refresh = (jump: number) => {
    const main = mainRef.value;

    if (!main) {
        return;
    }
    resetData();
    const fragment = document.createDocumentFragment();
    const scrollDiv = document.createElement("div");
    scrollDiv.className = "scrollDiv";
    scrollDiv.addEventListener("scroll", (v) => {
        curScrollType = curScroll > scrollDiv.scrollTop ? 1 : -1;
        curScroll = scrollDiv.scrollTop;
        if (scrollTime) {
            clearTimeout(scrollTime);
        }
        scrollTime = setTimeout(() => {
            const start = getStart(curScrollType);
            setDisplayPage(sortPageList[start]);
            console.log("scroll", start);
        }, scrollDelay);
    });
    scrollDiv.style.overflow = "auto";
    scrollDiv.style.height = "100%";
    scrollDiv.style.width = "100%";
    scrollDiv.style.scrollbarWidth = "none";
    const topDiv = resetTopDiv(jump);
    const contentDiv = resetContentDiv();
    const bottomDiv = resetBottomDiv(jump);
    scrollDiv.append(topDiv, contentDiv, bottomDiv);
    fragment.append(scrollDiv);
    main.append(fragment);
    setTimeout(() => {
        main.scroll({ behavior: "smooth", top: curTopHeight });
    }, 500);
};

onMounted(() => {
    console.log("waterfall");
    refresh(props.jump || 0);
});
</script>
<style lang="css" scoped>
.main {
    width: 100%;
    height: 100%;
}
</style>
