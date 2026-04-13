import fs from "fs"
import path from "path"

export function getViewFile(p: string) {
    const stat = fs.statSync(p);
    const isFolder = stat.isDirectory()
    const isFile = stat.isFile()
    if (!isFile && isFolder) {
        return undefined
    }
    const file: ViewFileType = {
        name: path.basename(p),
        size: stat.size,
        createTime: stat.birthtimeMs,
        updateTime: stat.mtimeMs,
        ext: isFile ? path.extname(p).slice(1).toLowerCase() : "",
        isFolder: isFolder
    }
    return file
}