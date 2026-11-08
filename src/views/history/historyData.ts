import { ref } from "vue";
import { userFetch } from "@/utils/jFetch";
import { useConfigStore } from "@/stores/config";
import { normalizeBasePath } from "@/utils/fileUrl";

/**
 * 打开历史与书签，都存在用户配置的云端（`data/userConfig.json` 的 `readHistory` / `bookmarks`）。
 *
 * 为什么要防抖：阅读时页码一直在变，逐页上传会把网络打满；这里只改内存，
 * 停手 SAVE_DELAY 之后才把整份列表推一次云端，离开阅读页时再 flushHistory() 补一刀。
 * 云端接口 `updateUserConfigs` 是按 key 合并的，所以整份覆盖也是安全的。
 */

/** 历史最多保留多少条（书与书库混在一起算） */
const MAX_HISTORY = 200;
/** 书签上限，超了淘汰最旧的 */
const MAX_BOOKMARKS = 500;
/** 页码这类高频变化：停手多久才推云端 */
const SAVE_DELAY = 4000;
/** 推送失败后的重试间隔 */
const RETRY_DELAY = 8000;

/** 打开历史，最新的在前 */
export const readHistory = ref<ReadHistoryItemType[]>([]);
/** 书签，最新的在前 */
export const bookmarks = ref<BookmarkItemType[]>([]);
export const historyLoaded = ref(false);
export const historyBusy = ref(false);
export const historyError = ref("");

let loadedUserUUID = "";
let saveTimer: number | undefined;
let dirty = false;
let pushing = false;
/**
 * 本地改动的版本号：每改一次 +1。
 * 用来防「拉云端时把本地刚发生的改动冲掉」——
 * 请求发出后、响应回来前用户又开了书，响应里是没有那条记录的旧列表，
 * 直接覆盖就会让刚打开的书记不进历史。
 */
let mutateSeq = 0;

const toNumber = (value: unknown, fallback = 0) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toText = (value: unknown) => (typeof value === "string" ? value : "");

/** 历史里「书」的唯一键：同一个 editUUID 下同一个 basePath 只留一条 */
export const historyBookId = (editUUID: string, basePath?: string | null) =>
    `book::${editUUID}::${normalizeBasePath(basePath)}`;

/** 历史里「书库」的唯一键 */
export const historyLibraryId = (libraryUUID: string) => `lib::${libraryUUID}`;

/**
 * 书库根目录的书 baseFile.name 被服务端归一成 "."，直接显示就是一个点。
 * 历史与书签里统一写成「根目录」，既好认也不会和空名字的条目混在一起。
 */
const displayBookName = (name: string) => (name === "." ? "根目录" : name);

const normalizeBookHistory = (raw: any): ReadHistoryBookItemType | null => {
    if (!raw || raw.kind !== "book") {
        return null;
    }
    const editUUID = toText(raw.editUUID);
    const name = displayBookName(toText(raw.name));
    if (!editUUID || !name) {
        return null;
    }
    const basePath = normalizeBasePath(raw.basePath);
    return {
        id: historyBookId(editUUID, basePath),
        kind: "book",
        editUUID,
        libraryUUID: toText(raw.libraryUUID),
        libraryName: toText(raw.libraryName),
        basePath,
        parentPath: normalizeBasePath(raw.parentPath),
        name,
        extType: raw.extType,
        isDir: !!raw.isDir,
        page: Math.max(1, Math.round(toNumber(raw.page, 1))),
        total: Math.max(0, Math.round(toNumber(raw.total))),
        pageName: toText(raw.pageName),
        openTime: toNumber(raw.openTime),
    };
};

const normalizeLibraryHistory = (raw: any): ReadHistoryLibraryItemType | null => {
    if (!raw || raw.kind !== "library") {
        return null;
    }
    const libraryUUID = toText(raw.libraryUUID);
    if (!libraryUUID) {
        return null;
    }
    return {
        id: historyLibraryId(libraryUUID),
        kind: "library",
        libraryUUID,
        libraryName: toText(raw.libraryName),
        pathUrl: toText(raw.pathUrl),
        openTime: toNumber(raw.openTime),
    };
};

/** 把云端任意数据洗成合法历史列表，坏条目直接丢，同 id 只留最新那条 */
export const normalizeHistory = (raw: unknown): ReadHistoryItemType[] => {
    if (!Array.isArray(raw)) {
        return [];
    }
    const byId = new Map<string, ReadHistoryItemType>();
    for (const item of raw) {
        const next = item?.kind === "library" ? normalizeLibraryHistory(item) : normalizeBookHistory(item);
        if (!next) {
            continue;
        }
        const old = byId.get(next.id);
        if (!old || old.openTime < next.openTime) {
            byId.set(next.id, next);
        }
    }
    return [...byId.values()]
        .sort((a, b) => b.openTime - a.openTime)
        .slice(0, MAX_HISTORY);
};

const normalizeBookmark = (raw: any): BookmarkItemType | null => {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const editUUID = toText(raw.editUUID);
    const name = toText(raw.name);
    if (!editUUID || !name) {
        return null;
    }
    return {
        id: toText(raw.id) || `bm_${toNumber(raw.createTime)}_${name}`,
        editUUID,
        libraryUUID: toText(raw.libraryUUID),
        libraryName: toText(raw.libraryName),
        basePath: normalizeBasePath(raw.basePath),
        parentPath: normalizeBasePath(raw.parentPath),
        name,
        extType: raw.extType,
        isDir: !!raw.isDir,
        page: Math.max(1, Math.round(toNumber(raw.page, 1))),
        pageName: toText(raw.pageName),
        note: toText(raw.note) || undefined,
        createTime: toNumber(raw.createTime),
    };
};

export const normalizeBookmarks = (raw: unknown): BookmarkItemType[] => {
    if (!Array.isArray(raw)) {
        return [];
    }
    const byId = new Map<string, BookmarkItemType>();
    for (const item of raw) {
        const next = normalizeBookmark(item);
        if (next && !byId.has(next.id)) {
            byId.set(next.id, next);
        }
    }
    return [...byId.values()]
        .sort((a, b) => b.createTime - a.createTime)
        .slice(0, MAX_BOOKMARKS);
};

/* ------------------------------ 云端读写 ------------------------------ */

/** 记下「本地改过了，还没推云端」；每改一次版本号 +1，用来挡住拉取/回填时用旧值覆盖 */
const markDirty = () => {
    dirty = true;
    mutateSeq += 1;
};

const scheduleSave = (delay = SAVE_DELAY) => {
    markDirty();
    if (saveTimer !== undefined) {
        window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
        saveTimer = undefined;
        void flushHistory();
    }, delay);
};

/** 待推送的历史改动：id -> 最后一次操作（同一本书多次改动合并成一条） */
const pendingHistory = new Map<string, "upsert" | "remove">();
/** 待推送的书签改动 */
const pendingBookmarks = new Map<string, "upsert" | "remove">();
let historyClearPending = false;
let bookmarksClearPending = false;

/** 记一笔「这条历史要同步」：翻页只是同一个 id 反复 upsert，天然被合并 */
const queueHistoryItem = (id: string) => {
    pendingHistory.set(id, "upsert");
};

const queueHistoryRemove = (id: string) => {
    pendingHistory.set(id, "remove");
};

const queueBookmarkItem = (id: string) => {
    pendingBookmarks.set(id, "upsert");
};

const queueBookmarkRemove = (id: string) => {
    pendingBookmarks.set(id, "remove");
};

/** 把队列里历史相关的改动逐条推上去；失败时把这条塞回队列，交给重试 */
const pushHistoryQueue = async (userUUID: string) => {
    if (historyClearPending) {
        historyClearPending = false;
        const res = await userFetch.request("patchHistory", { userUUID, op: "clear" });
        if (res.code != 200) {
            historyClearPending = true;
            throw new Error(res.msg || "历史保存失败");
        }
    }
    for (const [id, op] of [...pendingHistory]) {
        if (op === "remove") {
            const res = await userFetch.request("patchHistory", { userUUID, op: "remove", id });
            if (res.code != 200) {
                throw new Error(res.msg || "历史保存失败");
            }
            pendingHistory.delete(id);
            continue;
        }
        const item = readHistory.value.find((row) => row.id === id);
        // 队列里的条目已经被本地删掉了，就不用再 upsert
        if (!item) {
            pendingHistory.delete(id);
            continue;
        }
        const res = await userFetch.request("patchHistory", { userUUID, op: "upsert", item });
        if (res.code != 200) {
            throw new Error(res.msg || "历史保存失败");
        }
        pendingHistory.delete(id);
    }
};

/** 书签同理 */
const pushBookmarkQueue = async (userUUID: string) => {
    if (bookmarksClearPending) {
        bookmarksClearPending = false;
        const res = await userFetch.request("patchBookmarks", { userUUID, op: "clear" });
        if (res.code != 200) {
            bookmarksClearPending = true;
            throw new Error(res.msg || "书签保存失败");
        }
    }
    for (const [id, op] of [...pendingBookmarks]) {
        if (op === "remove") {
            const res = await userFetch.request("patchBookmarks", { userUUID, op: "remove", id });
            if (res.code != 200) {
                throw new Error(res.msg || "书签保存失败");
            }
            pendingBookmarks.delete(id);
            continue;
        }
        const item = bookmarks.value.find((row) => row.id === id);
        if (!item) {
            pendingBookmarks.delete(id);
            continue;
        }
        const res = await userFetch.request("patchBookmarks", { userUUID, op: "upsert", item });
        if (res.code != 200) {
            throw new Error(res.msg || "书签保存失败");
        }
        pendingBookmarks.delete(id);
    }
};

/**
 * 立刻把「变化的那几条」推上云端（离开阅读页、关页面前调用）。
 * 只发增量：翻一页就只发那一条历史（≈300B），不再整份列表上传。
 */
export const flushHistory = async () => {
    if (saveTimer !== undefined) {
        window.clearTimeout(saveTimer);
        saveTimer = undefined;
    }
    if (!dirty) {
        return;
    }
    const configStore = useConfigStore();
    if (!configStore.isLogin) {
        return;
    }
    if (pushing) {
        // 上一次还没回来，稍后再补
        scheduleSave(1000);
        return;
    }
    pushing = true;
    dirty = false;
    try {
        await pushHistoryQueue(configStore.userUUID);
        await pushBookmarkQueue(configStore.userUUID);
        historyError.value = "";
        historyLoaded.value = true;
        loadedUserUUID = configStore.userUUID;
    } catch (err: any) {
        historyError.value = err?.message || "历史保存失败";
        dirty = true;
    } finally {
        pushing = false;
    }
    if (dirty) {
        scheduleSave(RETRY_DELAY);
    }
};

/** 从云端拉一次历史与书签；force 或换了账号才会真的请求 */
export const loadHistory = async (force = false) => {
    const configStore = useConfigStore();
    if (!configStore.isLogin) {
        readHistory.value = [];
        bookmarks.value = [];
        historyLoaded.value = false;
        loadedUserUUID = "";
        historyError.value = "登录后才能同步历史";
        return;
    }
    const switched = loadedUserUUID !== configStore.userUUID;
    if (!force && !switched && historyLoaded.value) {
        return;
    }
    if (historyBusy.value) {
        return;
    }
    historyBusy.value = true;
    try {
        /**
         * 本地还有没推上去的改动（刚开的书、刚删的条目）时先推一次再拉。
         * 否则拉回来的旧列表会把这几秒内的改动直接冲掉——刚打开的书在历史里「消失」就是这么来的。
         */
        if (dirty) {
            await flushHistory();
        }
        const seq = mutateSeq;
        const res = await userFetch.request("getUserConfig");
        if (res.code == 200) {
            /**
             * 请求期间本地又改了（刚打开一本书）时，云端返回的是没有这条记录的旧列表，
             * 这时只认本地，标记为已加载但不动列表，改动会由防抖任务推上去。
             */
            if (mutateSeq === seq) {
                readHistory.value = normalizeHistory(res.data?.readHistory);
                bookmarks.value = normalizeBookmarks(res.data?.bookmarks);
            }
            historyError.value = "";
            historyLoaded.value = true;
            loadedUserUUID = configStore.userUUID;
        } else {
            historyError.value = res.msg || "历史读取失败";
        }
    } catch (err: any) {
        historyError.value = err?.message || "历史读取失败";
    } finally {
        historyBusy.value = false;
    }
};

/* ------------------------------ 历史的增删 ------------------------------ */

/** 打开一本书：有就顶到最前并刷新页码，没有就新建 */
export const touchHistoryBook = (input: {
    editUUID: string;
    libraryUUID: string;
    libraryName: string;
    basePath?: string | null;
    parentPath?: string | null;
    name: string;
    extType?: ViewFileExtType;
    isDir: boolean;
    page: number;
    total: number;
    pageName?: string;
}) => {
    if (!input.editUUID || !input.name) {
        return;
    }
    const name = displayBookName(input.name);
    const basePath = normalizeBasePath(input.basePath);
    const id = historyBookId(input.editUUID, basePath);
    const existed = readHistory.value.some((row) => row.id === id);
    const rest = readHistory.value.filter((row) => row.id !== id);
    const next: ReadHistoryItemType[] = [
        {
            id,
            kind: "book",
            editUUID: input.editUUID,
            libraryUUID: input.libraryUUID,
            libraryName: input.libraryName,
            basePath,
            parentPath: normalizeBasePath(input.parentPath),
            name,
            extType: input.extType,
            isDir: input.isDir,
            page: Math.max(1, Math.round(input.page || 1)),
            total: Math.max(0, Math.round(input.total || 0)),
            pageName: input.pageName || "",
            openTime: Date.now(),
        },
        ...rest,
    ];
    readHistory.value = next.slice(0, MAX_HISTORY);
    // 只把这一条排进待推送队列，不再整份上传
    queueHistoryItem(id);
    /**
     * 新开的书立刻推一次：一是别让它等 4 秒防抖（这段时间里切到历史页就可能看不到），
     * 二是新记录本身就值得马上落到云端；同一本书翻页才走防抖。
     */
    if (existed) {
        scheduleSave();
    } else {
        // 注意先 markDirty：flushHistory 见到 dirty 为假会直接返回，新书记录就丢了
        markDirty();
        void flushHistory();
    }
};

/** 阅读过程中更新页码：只动本地，等防抖结束才上云端 */
export const updateHistoryPage = (
    editUUID: string,
    basePath: string | null | undefined,
    page: number,
    total: number,
    pageName?: string
) => {
    const id = historyBookId(editUUID, basePath);
    const item = readHistory.value.find((row) => row.id === id);
    // 只更新「书」这条；书库条目没有页码
    if (!item || item.kind !== "book") {
        return;
    }
    const nextPage = Math.max(1, Math.round(page || 1));
    const nextTotal = Math.max(0, Math.round(total || 0));
    const nextName = pageName || "";
    if (item.page === nextPage && item.total === nextTotal && item.pageName === nextName) {
        return;
    }
    item.page = nextPage;
    item.total = nextTotal;
    item.pageName = nextName;
    queueHistoryItem(id);
    scheduleSave();
};

/** 打开一个书库 */
export const touchHistoryLibrary = (input: {
    libraryUUID: string;
    libraryName: string;
    pathUrl: string;
}) => {
    if (!input.libraryUUID) {
        return;
    }
    const id = historyLibraryId(input.libraryUUID);
    const rest = readHistory.value.filter((item) => item.id !== id);
    const next: ReadHistoryItemType[] = [
        {
            id,
            kind: "library",
            libraryUUID: input.libraryUUID,
            libraryName: input.libraryName,
            pathUrl: input.pathUrl || "",
            openTime: Date.now(),
        },
        ...rest,
    ];
    readHistory.value = next.slice(0, MAX_HISTORY);
    queueHistoryItem(id);
    scheduleSave();
};

export const removeHistoryItem = (id: string) => {
    const next = readHistory.value.filter((item) => item.id !== id);
    if (next.length === readHistory.value.length) {
        return;
    }
    readHistory.value = next;
    queueHistoryRemove(id);
    scheduleSave();
};

export const clearHistory = () => {
    if (!readHistory.value.length) {
        return;
    }
    readHistory.value = [];
    // 清空是一次整表操作，队列里的零散改动没有意义了
    pendingHistory.clear();
    historyClearPending = true;
    scheduleSave();
};

/* ------------------------------ 书签的增删 ------------------------------ */

const bookmarkKey = (item: { pageName?: string; page: number }) =>
    item.pageName || `#${item.page}`;

/** 这一页是否已经有书签 */
export const findBookmark = (
    editUUID: string,
    basePath: string | null | undefined,
    pageName: string | null | undefined,
    page: number
) => {
    const base = normalizeBasePath(basePath);
    const key = bookmarkKey({ pageName: pageName || "", page });
    return bookmarks.value.find(
        (item) =>
            item.editUUID === editUUID &&
            normalizeBasePath(item.basePath) === base &&
            bookmarkKey(item) === key
    );
};

export const addBookmark = (input: Omit<BookmarkItemType, "id" | "createTime">) => {
    const now = Date.now();
    const item: BookmarkItemType = {
        ...input,
        id: `bm_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: displayBookName(input.name),
        basePath: normalizeBasePath(input.basePath),
        parentPath: normalizeBasePath(input.parentPath),
        page: Math.max(1, Math.round(input.page || 1)),
        createTime: now,
    };
    bookmarks.value = [item, ...bookmarks.value].slice(0, MAX_BOOKMARKS);
    queueBookmarkItem(item.id);
    scheduleSave();
    return item;
};

export const removeBookmark = (id: string) => {
    const next = bookmarks.value.filter((item) => item.id !== id);
    if (next.length === bookmarks.value.length) {
        return;
    }
    bookmarks.value = next;
    queueBookmarkRemove(id);
    scheduleSave();
};

export const clearBookmarks = () => {
    if (!bookmarks.value.length) {
        return;
    }
    bookmarks.value = [];
    pendingBookmarks.clear();
    bookmarksClearPending = true;
    scheduleSave();
};

/* ------------------------------ 展示用的小工具 ------------------------------ */

const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期 */
export const formatRelativeTime = (time: number) => {
    if (!time) {
        return "";
    }
    const diff = Date.now() - time;
    if (diff < 60_000) {
        return "刚刚";
    }
    if (diff < 3_600_000) {
        return `${Math.floor(diff / 60_000)} 分钟前`;
    }
    if (diff < 86_400_000) {
        return `${Math.floor(diff / 3_600_000)} 小时前`;
    }
    if (diff < 7 * 86_400_000) {
        return `${Math.floor(diff / 86_400_000)} 天前`;
    }
    const date = new Date(time);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** 历史条目的「第 N / M 页」文案 */
export const historyPageText = (item: ReadHistoryBookItemType) => {
    if (!item.total) {
        return "";
    }
    return `第 ${item.page} / 共 ${item.total} 页`;
};
