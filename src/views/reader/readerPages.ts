import { computed } from "vue";
import { useViewStore } from "@/stores/view";
import { sortFileList } from "@common/utils/nameSort";
import { readerSort } from "./readerSort";

/**
 * 阅读页实际使用的页列表：按当前排序规则排好序。
 * 瀑布流与单页翻页都从这里取顺序，所以 readerView 里的 `currentIndex`
 * 是「这个数组里的下标」，不是服务端的 `item.index`（后者只用来拼图片地址）。
 */
export const readerPages = computed<ComicFileType[]>(() => {
    const list = useViewStore().comicFileList?.list;
    if (!list?.length) {
        return [];
    }
    return sortFileList(list, readerSort.type, readerSort.order);
});

/** 按文件名找它在当前排序列里的位置，找不到返回 -1 */
export const indexOfPageName = (name: string): number => {
    if (!name) {
        return -1;
    }
    return readerPages.value.findIndex((item) => item.name === name);
};
