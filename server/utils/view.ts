import { imageTypeList, zipTypeList } from "@common/utils/ext";
import fs from "fs";
import type { Stats } from "fs";
import path from "path";
import StreamZip from "node-stream-zip";
import { getFileExt, getSizeStr } from ".";
import { bookKindOf, getBookViewList } from "./book";
import { getMyStreamZip } from "./myStreamZip";

export function getViewFile(p: string) {
    const stat = fs.statSync(p);
    const isDir = stat.isDirectory();
    const isFile = stat.isFile();
    if (!isFile && !isDir) {
        return undefined;
    }
    const sizeStr = getSizeStr(stat.size);
    const extData = isDir ? undefined : getFileExt(p);

    const file: ViewFileType = {
        name: path.basename(p),
        size: stat.size,
        sizeStr: sizeStr,
        createTimeMS: stat.birthtimeMs,
        updateTimeMS: stat.mtimeMs,
        createTime: stat.birthtime.toLocaleString(),
        updateTime: stat.mtime.toLocaleString(),
        extType: extData?.extType || undefined,
        ext: extData?.ext || "",
        isDir
    };
    return file;
}

/** 目录书媒体页清单缓存的 LRU 上限：200 个目录 / 50,000 条媒体 */
const DIR_LIST_MAX = 200;
const DIR_LIST_MAX_ITEMS = 50_000;
/** 目录书只把图片和视频当成阅读页 */
const MEDIA_EXTS: ViewFileExtType[] = ['image', 'video'];

interface DirListCacheEntry {
    mtimeMs: number;
    size: number;
    list: ComicFileType[];
}

/**
 * 目录书取图的热路径缓存。
 *
 * 以前 /api/file 每取一张图都会 readdirSync 整个目录，再对每个条目 statSync：
 * 3000 页的书每翻一页就是约 3000 次 stat。这里按「书库内绝对目录」缓存媒体页清单，
 * 命中时只对目录本身 stat 一次校验 mtimeMs + size；新增/删除/重命名会改目录 mtime，
 * 只改某张图片的内容不会改，所以页序不会被无谓打乱。
 */
const dirListCache = new Map<string, DirListCacheEntry>();
let dirListItemCount = 0;

function buildDirMediaList(dir: string): ComicFileType[] {
    const filenameList = fs.readdirSync(dir);
    const list: ComicFileType[] = [];
    for (let i = 0; i < filenameList.length; i++) {
        const pf = path.join(dir, filenameList[i]);
        let f: ViewFileType | undefined;
        try {
            f = getViewFile(pf);
        }
        catch (e) {
            // readdir 与 stat 之间文件被删掉：跳过它，不要让整次取图变成 500
            if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
                continue;
            }
            throw e;
        }
        if (!f || f.isDir || !f.extType || !MEDIA_EXTS.includes(f.extType)) {
            continue;
        }
        list.push({ ...f, index: list.length });
    }
    return list;
}

/**
 * 取目录书的媒体页清单。调用方只读，返回的数组是浅拷贝，
 * 条目对象缓存复用；index 与 readdirSync 原始顺序保持一致。
 */
export function getDirMediaList(dir: string, knownStat?: Stats): ComicFileType[] {
    const stat = (knownStat ?? fs.statSync(dir)) as Stats;
    const key = path.resolve(dir);
    const cached = dirListCache.get(key);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        // 命中后挪到队尾，保持 LRU 顺序
        dirListCache.delete(key);
        dirListCache.set(key, cached);
        return cached.list.slice();
    }
    if (cached) {
        dirListCache.delete(key);
        dirListItemCount -= cached.list.length;
    }

    const list = buildDirMediaList(dir);
    // 单个目录本身超过总条目上限时不缓存，避免缓存自己突破 50,000 条
    if (list.length <= DIR_LIST_MAX_ITEMS) {
        dirListCache.set(key, { mtimeMs: stat.mtimeMs, size: stat.size, list });
        dirListItemCount += list.length;
        while (dirListCache.size > DIR_LIST_MAX || dirListItemCount > DIR_LIST_MAX_ITEMS) {
            const oldestKey = dirListCache.keys().next().value;
            if (typeof oldestKey !== "string") {
                break;
            }
            const oldest = dirListCache.get(oldestKey);
            if (!oldest) {
                dirListCache.delete(oldestKey);
                continue;
            }
            dirListCache.delete(oldestKey);
            dirListItemCount -= oldest.list.length;
        }
    }
    return list;
}

export function getComicViewListByFile(urls: string[]): [ComicFileListType | undefined, any] {
    const p = path.join(...urls);
    const stat = fs.statSync(p);
    const isDir = stat.isDirectory();
    const dir = isDir ? p : path.dirname(p);
    const curname = isDir ? undefined : path.basename(p);
    const list = getDirMediaList(dir, isDir ? stat : undefined);
    let start = 0;
    if (curname) {
        const found = list.findIndex((item) => item.name === curname);
        if (found >= 0) {
            start = found;
        }
    }
    // baseFile 一直用「拼上书库根的绝对路径」去读：以前这里用的是相对路径，
    // 只有正巧是 "."（工作目录）时才能 stat 到，子目录里的书会直接抛 ENOENT 变成 500。
    const relBase = urls.length == 1 ? dir : path.join(...[...urls].slice(1, isDir ? undefined : -1));
    const absBase = urls.length == 1 ? dir : path.join(urls[0]!, relBase);
    const baseFile = getViewFile(absBase)!;
    // 书库根目录下的书：保持原来的 "." 名字，避免改动阅读进度的 key
    if (urls.length > 1 && relBase === ".") {
        baseFile.name = ".";
    }
    return [{
        baseFile,
        start,
        basePath: urls.length == 1 ? dir : relBase,
        list
    }, undefined];


}

export async function getComicViewList(baseUrl: string, url: string, f: ViewFileType, nameEncoding?: string): Promise<[ComicFileListType | undefined, any]> {
    const p = path.join(baseUrl, url, f.name);
    if (f.extType == 'zip') {
        const zipData = await getMyStreamZip(p, nameEncoding);
        if (zipData[1]) {
            return [undefined, zipData[1]];
        }
        return [{
            list: zipData[0]!.getList(),
            baseFile: f,
            basePath: path.join(url, f.name),
            start: 0
        }, undefined];
    }
    // 容器书：页在文件内部，列表由 book 模块给出；形状与 zip 那条链路一致
    if (bookKindOf(f.extType)) {
        return [await getBookViewList(p, f, path.join(url, f.name)), undefined];
    }
    return [getComicViewListByFile([baseUrl, url, f.name])[0], undefined];
}