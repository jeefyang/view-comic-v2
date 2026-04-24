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
} & ComicFileType;