import path from 'path';
import fs from "fs";
import { LIBRARY_FILE } from "../utils/cache";
import { nanoid } from 'nanoid';

let libCache: JsonLibrary[] = [];

export function readLibs(): JsonLibrary[] {
    if (!fs.existsSync(LIBRARY_FILE)) {
        fs.writeFileSync(LIBRARY_FILE, JSON.stringify([], null, 4));
        return libCache;
    }
    libCache = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    return libCache;
};

export function getList(): JsonLibrary[] {
    if (!libCache.length) {
        readLibs();
    }
    return libCache;
};


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
        createTime: new Date().getTime(),
        modifyTime: new Date().getTime()
    };
    libCache.push(item);
    updateLibs();
    return [item, undefined];
}

export function removeLib(target: EditLibraryType): [JsonLibrary | undefined, any] {
    const index = libCache.findIndex(item => item.name == target.name);
    if (index == -1) {
        return [undefined, '未找到'];
    }
    const item = libCache[index];
    libCache.splice(index, 1);
    updateLibs();
    return [item, undefined];
};

export function editLib(target: EditLibraryType): [JsonLibrary | undefined, any] {
    const list = getList();
    const index = list.findIndex(item => item.name == target.name);
    if (index == -1) {
        return [undefined, '未找到'];
    }
    const item: JsonLibrary = { ...list[index] };
    if (target.newName) {
        item.name = target.newName;
    }
    if (target.pathUrl) {
        item.pathUrl = target.pathUrl;
    }
    item.modifyTime = new Date().getTime();
    list[index] = item;
    updateLibs();
    return [item, undefined];
};