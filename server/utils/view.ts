import { imageTypeList, zipTypeList } from "@common/utils/ext";
import fs from "fs";
import path from "path";
import StreamZip from "node-stream-zip";
import { getFileExt, getSizeStr } from ".";
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

export function getComicViewListByFile(urls: string[]): [ComicFileListType | undefined, any] {
    const p = path.join(...urls);
    const stat = fs.statSync(p);
    const isDir = stat.isDirectory();
    const dir = isDir ? p : path.dirname(p);
    const curname = isDir ? undefined : path.basename(p);
    const incldeExts: ViewFileExtType[] = ['image', 'video'];
    let start = 0;
    const filenameList = fs.readdirSync(dir);
    const list: ComicFileType[] = [];
    let len = 0;
    for (let i = 0; i < filenameList.length; i++) {
        const pf = path.join(dir, filenameList[i]);
        const f = getViewFile(pf);
        if (f?.isDir) {
            continue;
        }
        if (!f?.extType || !incldeExts.includes(f.extType)) {
            continue;
        }
        if (curname && curname == filenameList[i]) {
            start = len;
        }
        len = list.push({ ...f, index: len });
    }
    return [{
        baseFile: urls.length == 1 ? getViewFile(dir)! : getViewFile(path.join(...[...urls].slice(1, isDir ? undefined : -1)))!,
        start,
        basePath: urls.length == 1 ? dir : path.join(...[...urls].slice(1, isDir ? undefined : -1)),
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
    return [getComicViewListByFile([baseUrl, url, f.name])[0], undefined];
}