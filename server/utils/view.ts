import fs from "fs";
import path from "path";

const zipTypeList: string[] = ['zip', "rar"];
const imageTypeList: string[] = ['png', "jpg", "jpeg", "gif", "webp", "apng"];

export function getViewFile(p: string) {
    const stat = fs.statSync(p);
    const isDir = stat.isDirectory();
    const isFile = stat.isFile();
    if (!isFile && !isDir) {
        return undefined;
    }
    const size = stat.size;
    const sizeList: string[] = ['B', 'KB', 'MB', 'GB', 'TB'];
    let sizeSplit = size;
    let sizeStr = "";
    for (let i = 0; i < sizeList.length; i++) {
        if (sizeSplit < 1024) {
            break;
        }
        sizeSplit = sizeSplit / 1024;
        sizeStr = sizeSplit.toFixed(2) + sizeList[i];
    }
    const ext = isFile ? path.extname(p).slice(1).toLowerCase() : "";
    let extType: ViewFileExtType | undefined = undefined;
    if (ext && !isDir) {
        const list: { [x in ViewFileExtType]?: string[] } = {
            "zip": zipTypeList,
            "image": imageTypeList
        };
        for (const key in list) {
            //@ts-expect-error
            if (list[key].includes(ext)) {
                //@ts-expect-error
                extType = key;
                break;
            }
        }
    }
    if (!isDir && !extType) {
        return undefined;
    }
    const file: ViewFileType = {
        name: path.basename(p),
        size: stat.size,
        sizeStr: sizeStr,
        createTimeMS: stat.birthtimeMs,
        updateTimeMS: stat.mtimeMs,
        createTime: stat.birthtime.toLocaleString(),
        updateTime: stat.mtime.toLocaleString(),
        extType: isDir ? undefined : 'zip',
        ext: ext,
        isDir
    };
    return file;
}