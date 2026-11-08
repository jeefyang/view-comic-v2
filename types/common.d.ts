// 400 前端错误
// 401 未登录
// 402 参数缺失
// 403 参数错误
// 500 服务器错误
// 501 服务器数据缺失
// 502 缺少权限
// 503 服务器数据冲突
// 666 前端请求报错
type JFetchReturnType<D = any> = {
    code: -1 | 200 | 400 | 401 | 402 | 403 | 500 | 501 | 502 | 503 | 666;
    msg?: string;
    data?: D;
    err?: any;
};

type SortNameType = "name" | "extension" | "size" | "createTime" | "updateTime" | 'number';

type IncludeFileType = "filefolder" | "file" | "folder";

type JsonLibrary = {
    name: string; pathUrl: string; uuid: string; createTime?: number;
    modifyTime?: number; groupList?: string[];
    editUUID?: string;
};

type ViewFileType = {
    name: string;
    size: number;
    createTime: string;
    updateTime: string;
    sizeStr: string;
    createTimeMS: number;
    updateTimeMS: number;
    ext: string;
    isDir: boolean;
    extType?: ViewFileExtType;
};

type ComicFileType = ViewFileType & {
    index: number;
    width?: number;
    height?: number;
};

type ComicFileListType = {
    list: ComicFileType[],
    baseFile: ViewFileType,
    start: number,
    basePath: string;
};




type ViewFileExtType = "zip" | "image" | "video" | "other";

type viewFolderType = {
    libUUID: string;
    basePath: string;
    list: ViewFileType[];
};


interface JsonConfig {

}

interface JsonUser {
    username: string;
    passwordHash: string;
    initialized: boolean;
    type: UserTypeType;
    createTime?: number;
    modifyTime?: number;
    uuid: string;
    /** 分组,管理员默认为空 */
    group: string;
}

type UserTypeType = 'admin' | 'user';

type UserConfigType = {
    userUUID: string;
    padding?: number;
    pageMargin?: number;
    /** 用户上传的点击区域布局，key 为唯一名称，同名覆盖 */
    tapZoneLayouts?: Record<string, UserTapZoneItemType[]>;
    /** 打开历史：书与书库混在一起按时间倒序 */
    readHistory?: ReadHistoryItemType[];
    /** 阅读书签 */
    bookmarks?: BookmarkItemType[];
};

/**
 * 历史里「打开过的书」。
 * id 由 `editUUID + basePath` 决定，同一本书反复打开只更新这一条。
 */
type ReadHistoryBookItemType = {
    id: string;
    kind: "book";
    editUUID: string;
    libraryUUID: string;
    libraryName: string;
    /** 书本身的相对路径：压缩包是 `a/b.zip`，目录书是 `a/b`，书库根下的书是空串 */
    basePath: string;
    /** 书所在目录，重开时按它请求 comicViewList */
    parentPath: string;
    name: string;
    extType?: ViewFileExtType;
    isDir: boolean;
    /** 上次读到的页码（1 基）与总页数 */
    page: number;
    total: number;
    /** 上次读到的文件名；排序规则变了也能按名字把位置找回来 */
    pageName?: string;
    openTime: number;
};

/** 历史里「打开过的书库」 */
type ReadHistoryLibraryItemType = {
    id: string;
    kind: "library";
    libraryUUID: string;
    libraryName: string;
    pathUrl: string;
    openTime: number;
};

type ReadHistoryItemType = ReadHistoryBookItemType | ReadHistoryLibraryItemType;

/** 阅读书签：一本书里的一页 */
type BookmarkItemType = {
    id: string;
    editUUID: string;
    libraryUUID: string;
    libraryName: string;
    basePath: string;
    parentPath: string;
    name: string;
    extType?: ViewFileExtType;
    isDir: boolean;
    /** 页码（1 基） */
    page: number;
    pageName: string;
    note?: string;
    createTime: number;
};

/** 点击区域布局的存储形态（与前端 TapZone 结构一致，坐标 0~1） */
type UserTapZoneItemType = {
    id: string;
    action: string;
    rect: { x: number; y: number; width: number; height: number; };
    /** action 为 setFitMode 时生效 */
    fitMode?: string;
};

type EditLibraryType = {
    name?: string;
    newName?: string;
    pathUrl?: string;
    /** 权限分组 */
    groupList?: string[];
    uuid?: string;
};


type EditUserType = {
    editType: 'add' | 'edit' | 'delete' | 'editGroup',
    adminUUID?: string;
    adminToken?: string;
    userUUID?: string;
    newUsername?: string;
    password?: string;
    newPassword?: string;
    group?: string;
};

type UserTokenType = {
    token: string;
    uuid: string;
    createTime: string | number;
};

type WebUserType = {
    token?: string;
    username: string;
    type: UserTypeType;
    group: string;
    uuid: string;
};

type WaterfallPageType = {
    url: string,
    /** 是否已经加载过了 */
    loaded: boolean,
    /** div应该显示的宽度 */
    divWidth: number,
    /** div应该显示的高度 */
    divHeight: number,
    /** 内容缩放 */
    contentScale: number,
    /** 显示的宽(包含边距) */
    displayWidth: number,
    /** 显示的高(包含边距) */
    displayHeight: number,
    /** 滚动的位置 */
    scroll: number;
    /** 装载的元素 */
    InsertDom?: HTMLElement;
    /** 预加载的元素 */
    prelodDom?: HTMLElement;
    /** 排序后的位置 */
    sortIndex: number;
    /**
     * 这一屏属于「排序后第几张图」（0 基）。
     * 与 sortIndex 的区别：双开页一张图占两屏，两屏的 order 相同、sortIndex 不同。
     */
    order?: number;
    /**
     * 双开页被拆成两屏时，这是第几屏：
     * 0 = 左半，1 = 右半；不分割的页没有这个字段。
     */
    half?: 0 | 1;
} & ComicFileType;