import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { libraryFetch, viewFetch } from '@/utils/jFetch';
import type { ResSendType } from '@common/apis/tools/apiUrlsTrans';
import { normalizeBasePath, normalizeFileName } from '@/utils/fileUrl';
import { sortFileList } from '@common/utils/nameSort';
import {
    flushPageSizes as flushPageSizeCache,
    getPageSizes,
    migrateLegacyPageSizes,
    setPageSize as setPageSizeCache
} from '@/utils/pageSizes';

/**
 * 书架列表项：`thumbPath` 在生成列表那一刻就固定下来。
 * 不要用 `[...shelfPath, item.name].join('/')` 现算 —— 点进目录时 `shelfPath` 立刻变了、
 * 列表数据却要等接口回来，这一瞬间旧行会带着新前缀去要缩略图
 * （于是日志里出现 `compare/img-006.jpg`、`number/img-004.jpg` 这种根本不存在的路径）。
 */
export type ShelfFileItem = ViewFileType & { thumbPath: string };


export const useViewStore = defineStore('view', () => {
    const saveKey = "view";
    const libraryList = ref([] as JsonLibrary[]);
    const curLibrary = ref(<Partial<JsonLibrary>>{});
    const shelfPath = ref(<string[]>[]);
    const shelfFolder = ref(<viewFolderType | undefined>undefined);
    const shelfFileList = ref(<ShelfFileItem[]>[]);
    const shelfSearchKey = ref("");
    const shelfSortType = ref(<SortNameType>"updateTime");
    const shelfSortValue = ref(<1 | -1>1);
    const shelfIncludeType = ref(<IncludeFileType>"filefolder");
    const shelfJumpName = ref(<string>"");
    const shelfScrollName = ref(<string>"");
    const shelfLoading = ref(false);
    const comicFileList = ref({} as ComicFileListType);
    /**
     * 当前 shelfPath 属于哪个书库。换书库时要清空书架路径，
     * 但只认这个持久化的标记，不能用组件里的临时变量——否则从阅读页返回、
     * 或刷新后重新挂载 shelfView 时会被误判成「换了书库」而回到根目录。
     */
    const shelfLibraryUUID = ref(<string>"");
    /**
     * 本次会话里「从书架点了具体某一页进阅读」的文件名，**不持久化**。
     * 刷新后自然为空，这样 reader 才不会拿缓存里的 start 把位置带偏。
     */
    const pendingOpenName = ref(<string>"");



    const returnData = {
        curLibrary, shelfPath, shelfSearchKey, shelfSortType, shelfSortValue
        , shelfIncludeType, shelfScrollName, comicFileList, shelfLibraryUUID
    };

    /** view 只持久化结构；逐页宽高存在 view:sizes:* 的独立尺寸表里 */
    const stripPageSizes = (list: ComicFileListType | undefined): ComicFileListType | undefined => {
        if (!list?.list?.length) return list;
        let changed = false;
        const pages = list.list.map((item) => {
            if (item.width === undefined && item.height === undefined) return item;
            changed = true;
            const copy: ComicFileType = { ...item };
            delete copy.width;
            delete copy.height;
            return copy;
        });
        return changed ? { ...list, list: pages } : list;
    };

    const save = () => {
        const obj: any = {};
        for (let key in returnData) {
            const value = (returnData as any)[key].value;
            obj[key] = key === "comicFileList" ? stripPageSizes(value) : value;
        }
        localStorage.setItem(saveKey, JSON.stringify(obj));
    };

    const load = () => {
        const config = localStorage.getItem(saveKey);
        if (config) {
            const obj = JSON.parse(config);
            for (let key in obj) {
                if (returnData[key]) {
                    returnData[key].value = obj[key];
                }

            }
            // 旧版把每页宽高存在 comicFileList 里，首次加载搬到尺寸表后重写一次 view
            if (migrateLegacyPageSizes(curLibrary.value?.editUUID, comicFileList.value)) {
                save();
            }
        }
    };

    const updateShelfFolder = async (isSort = true) => {
        if (!curLibrary.value.editUUID) {
            shelfFolder.value = undefined;
            return;
        }
        shelfLoading.value = true;
        // 先清空旧列表：目录切换后旧条目若还留着，它们会带着新的 shelfPath 去要缩略图，必定 404
        shelfFileList.value = [];
        shelfFolder.value = undefined;
        shelfScrollName.value = "";
        const res = await viewFetch.request("folder", { editUUID: curLibrary.value.editUUID!, path: shelfPath.value.join('/') });
        shelfLoading.value = false;
        if (res.code != 200) {
            shelfFolder.value = undefined;

            return res;
        }
        shelfFolder.value = res.data;
        if (!isSort) {
            return;
        }
        sortShelfFileList();
    };

    /**
     * 书架的过滤 + 排序：
     * 1. 按 shelfIncludeType 过滤文件/文件夹；
     * 2. 按 shelfSearchKey 做文件名子串过滤（不区分大小写）；
     * 3. 按 shelfSortType + shelfSortValue 排序；
     * 4. 正序时文件夹在前、文件在后；反序时整个列表倒转，文件夹排到最后。
     */
    const sortShelfFileList = () => {
        if (!shelfFolder.value) {
            shelfFileList.value = [];
            return;
        }
        let list = shelfFolder.value.list.filter((item) => {
            if (shelfIncludeType.value == "file") {
                return !item.isDir;
            }
            if (shelfIncludeType.value == "folder") {
                return item.isDir;
            }
            return true;
        });
        const key = shelfSearchKey.value.trim().toLowerCase();
        if (key) {
            list = list.filter((item) => item.name.toLowerCase().includes(key) || (item.ext || "").toLowerCase().includes(key));
        }
        // 缩略图路径在这一刻定死（前缀 = 生成列表时的 shelfPath），之后导航/换书都不会改它
        const prefix = shelfPath.value.join("/");
        // 老数据 / 旧接口可能没带 extType，按扩展名再兜一层
        const isVideoItem = (item: ViewFileType) => item.extType === "video" || ["mp4", "webm"].includes((item.ext || "").toLowerCase());
        const toShelfItem = (item: ViewFileType): ShelfFileItem => ({
            ...item,
            // 文件夹 / 图片 / 压缩包 / 电子书 / 视频要缩略图；其它类型不试
            thumbPath: item.isDir || item.extType === "image" || item.extType === "zip" || item.extType === "pdf" || item.extType === "epub" || item.extType === "mobi" || isVideoItem(item)
                ? [prefix, item.name].filter(Boolean).join("/")
                : ""
        });
        const dirs = sortFileList(list.filter((item) => item.isDir), shelfSortType.value, shelfSortValue.value).map(toShelfItem);
        const files = sortFileList(list.filter((item) => !item.isDir), shelfSortType.value, shelfSortValue.value).map(toShelfItem);
        // 正序：文件夹在前；反序：整个列表倒转，文件夹排到最后（同资源管理器里按「反序」排完的样子）
        shelfFileList.value = shelfSortValue.value == 1 ? [...dirs, ...files] : [...files, ...dirs];
        shelfScrollName.value = "";
        // 排序方式 / 过滤类型 / 搜索词都变了，顺手落盘，下次进书架还是这套偏好
        save();
        return [...shelfFileList.value];
    };

    const updateLibraryList = async () => {
        const res = await libraryFetch.request("getList");
        if (res.code == 200) {
            libraryList.value = res.data!;
        }
        return res;
    };

    const updateLibrary = async (item: JsonLibrary) => {
        const res = await libraryFetch.request("update", { ...item });
        if (res.code == 200) {
            const json = res.data;
            const index = libraryList.value.findIndex(item => item.uuid == json.uuid);
            if (index != -1) {
                libraryList.value[index] = json;
            }
            // 当前书库被重新扫描：就地更新，别清空（清空会让书架/阅读页以为没选书库）
            if (json.uuid == curLibrary.value?.uuid) {
                curLibrary.value = json;
            }
        }
        save();
        return res;
    };

    const removeLibrary = async (item: JsonLibrary) => {
        const res = await libraryFetch.request("remove", { uuid: item.uuid });
        if (res.code == 200) {
            // 先记「删的是不是当前书库」，再 splice：反过来查一定查不到
            const isCurrent = item.uuid == curLibrary.value?.uuid;
            const index = libraryList.value.findIndex(lib => lib.uuid == item.uuid);
            if (index != -1) {
                libraryList.value.splice(index, 1);
            }
            if (isCurrent) {
                curLibrary.value = {};
            }
        }
        save();
        return res;
    };

    const setLibrary = (item: JsonLibrary) => {
        // 换了书库，之前记的书架路径对它没意义
        if (curLibrary.value?.uuid != item.uuid) {
            shelfPath.value = [];
        }
        shelfLibraryUUID.value = item.uuid;
        curLibrary.value = item;
        save();
    };

    const getShelfJump = () => {
        const index = shelfFileList.value.findIndex(item => item.name == shelfJumpName.value);
        shelfJumpName.value = "";
        return index == -1 ? 0 : index;
    };

    /**
     * 服务端返回的 comicViewList 不含图片宽高（只有 name/size/index）。
     * 宽高是 reader 里图片加载后按需写进独立尺寸表并持久化的，用于计算每页占位高度和阅读进度定位。
     * 重新拉取同一个列表时必须按文件名把尺寸表里的宽高合并回来，否则占位高度会退回按屏幕估算，
     * 导致刷新后跳回的位置偏移。尺寸表的键包含书身份，换书不会串号。
     */
    const mergeCachedSize = (nextList: ComicFileListType, sizes: Map<string, { width: number; height: number }>) => {
        if (!sizes.size || !nextList?.list?.length) return nextList;
        nextList.list = nextList.list.map((item) => {
            const size = sizes.get(item.name);
            if (!size) return item;
            if (item.width === size.width && item.height === size.height) return item;
            return { ...item, width: size.width, height: size.height };
        });
        return nextList;
    };

    const updateComicViewList = async (f: ViewFileType, path = shelfPath.value.join('/')) => {
        const res = await viewFetch.request("comicViewList", { editUUID: curLibrary.value.editUUID!, path, file: f });
        if (res.code != 200) {
            return res;
        }
        const data = res.data!;
        // 书库根目录下的书，服务端会给 basePath="."、baseFile.name="."，归一成空串再存，
        // 否则取图地址会拼出 `.../<index>/.`，也会污染阅读进度的 key。
        data.basePath = normalizeBasePath(data.basePath);
        if (data.baseFile) {
            data.baseFile = { ...data.baseFile, name: normalizeFileName(data.baseFile.name) };
        }
        const sizes = getPageSizes(curLibrary.value.editUUID!, data.basePath, data.baseFile?.name);
        const merged = mergeCachedSize(data, sizes);
        comicFileList.value = merged;
        save()
        return res;
    };

    /** 记录当前书某一页的真实宽高；实际写入合并到尺寸表，避免整份 view 反复序列化 */
    const setPageSize = (name: string, width: number, height: number) => {
        const list = comicFileList.value;
        const editUUID = curLibrary.value.editUUID;
        if (!editUUID || !list?.baseFile || !name) return;
        setPageSizeCache(editUUID, list.basePath, list.baseFile.name, name, width, height);
    };

    /**
     * 用缓存里的书重新校验一次：压缩包被删/目录不存在时服务端返回非 200。
     * 供 reader 入口守卫使用，返回 404 时调用方应回首页。
     */
    const reloadComicViewList = async (): Promise<ResSendType<ComicFileListType>> => {
        const list = comicFileList.value;
        if (!curLibrary.value.editUUID || !list?.baseFile) {
            return { code: 404, msg: "资源不存在" };
        }
        /**
         * basePath 存的是「这本书的完整相对路径」：
         * 压缩包是 `img.zip`、`sub/img.zip`，目录漫画是 `a/b`（书就是这个目录本身）。
         * 服务端要的是「所在目录 + 文件名」，所以统一拆成父路径 + 最后一段，
         * 否则压缩包会拼成 `img.zip/img.zip`、嵌套目录会拼成 `a/b/b`，都会 404。
         */
        const segments = (list.basePath || "").split(/[\\/]+/).filter(Boolean);
        const name = segments.pop() ?? "";
        return await updateComicViewList({ ...list.baseFile, name }, segments.join("/"));
    };



    load();

    return {
        ...returnData,
        save,
        load,
        setLibrary,
        shelfFolder,
        updateShelfFolder,
        shelfFileList,
        sortShelfFileList,
        shelfJumpName,
        getShelfJump,
        shelfLoading,
        libraryList, updateLibraryList,
        updateLibrary, removeLibrary,
        updateComicViewList,
        reloadComicViewList,
        setPageSize,
        flushPageSizes: flushPageSizeCache,
        pendingOpenName
    };
});