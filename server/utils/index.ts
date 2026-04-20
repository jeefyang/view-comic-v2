import { imageTypeList, zipTypeList } from "@common/utils/ext";
import path from "path";

export function getSizeStr(size: number) {
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
    return sizeStr;
}

export function getFileExt(p: string) {
    const ext = path.extname(p).slice(1).toLowerCase() || "";
    let extType: ViewFileExtType | undefined = undefined;
    if (ext) {
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
    return { ext, extType };
}