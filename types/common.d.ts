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

type LibraryType = { name: string; pathUrl: string; };


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
}

type UserTypeType = 'admin' | 'user';

type configType = {
};


type EditUserType = {
    editType: 'add' | 'edit' | 'delete',
    adminUser?: string;
    adminToken?: string;
    username?: string;
    newUsername?: string;
    password?: string;
    newPassword?: string;
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
};

