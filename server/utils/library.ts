import fs from "fs";
import { LIBRARY_FILE } from "../utils/cache";
import { nanoid } from 'nanoid';
import { getUserFromToken } from "./user";

let libCache: JsonLibrary[] = [];

export function readLibs(): JsonLibrary[] {
    if (!fs.existsSync(LIBRARY_FILE)) {
        fs.writeFileSync(LIBRARY_FILE, JSON.stringify([], null, 4));
        return libCache;
    }
    libCache = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    return libCache;
};

export function getList(token?: string): [JsonLibrary[] | undefined, any] {
    if (!libCache.length) {
        readLibs();
    }
    let list = getLibCache();
    if (token) {
        const data = getUserFromToken(token);
        if (data[1]) {
            return [undefined, "token不存在"];
        }
        const user = data[0]!;
        if (user.type != 'admin') {
            list = list.filter(c => !c.groupList || c.groupList.length == 0 || c.groupList.includes(user.group));
        }
    }
    return [list, undefined];
};

export function getLibCache() {
    return libCache.map(c => ({ ...c }));
}


export function updateLibs() {
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(libCache, null, 4));
}


export function addLib(target: EditLibraryType): [JsonLibrary | undefined, any] {
    if (!target.name) {
        return [undefined, '请填写名称'];
    }
    if (!target.pathUrl) {
        return [undefined, '请填写路径'];
    }
    if (libCache.find(item => item.name == target.name)) {
        return [undefined, '已存在'];
    }
    const item: JsonLibrary = {
        name: target.name,
        pathUrl: target.pathUrl,
        uuid: nanoid(8),
        editUUID: nanoid(8),
        groupList: target.groupList || [],
        createTime: new Date().getTime(),
        modifyTime: new Date().getTime()
    };
    libCache.push(item);
    updateLibs();
    return [item, undefined];
}

export function removeLib(target: EditLibraryType): [JsonLibrary | undefined, any] {
    if (!target.uuid) {
        return [undefined, "请输入uuid"];
    }
    const index = libCache.findIndex(item => item.uuid == target.uuid);
    if (index == -1) {
        return [undefined, '未找到'];
    }
    const item = libCache[index];
    libCache.splice(index, 1);
    updateLibs();
    return [item, undefined];
};

export function editLib(target: EditLibraryType): [JsonLibrary | undefined, any] {
    if (!target.uuid) {
        return [undefined, "请输入uuid"];
    }

    const index = libCache.findIndex(item => item.uuid == target.uuid);

    if (index == -1) {
        return [undefined, '未找到'];
    }
    const item: JsonLibrary = { ...libCache[index] };
    if (target.newName) {
        item.name = target.newName;
    }
    if (target.pathUrl) {
        item.pathUrl = target.pathUrl;
    }
    if (target.groupList) {
        item.groupList = target.groupList;
    }
    item.modifyTime = new Date().getTime();
    item.editUUID = nanoid(8);
    libCache[index] = item;
    updateLibs();
    return [item, undefined];
};

export function getLibPathByUUID(uuid?: string, editUUID?: string): [string | undefined, any] {
    let index = -1;
    if (uuid) {
        index = libCache.findIndex(item => item.uuid == uuid);
    }
    else if (editUUID) {
        index = libCache.findIndex(item => item.editUUID == editUUID);
    }
    if (index == -1) {
        return [undefined, '未找到'];
    }
    return [libCache[index].pathUrl, undefined];
}
