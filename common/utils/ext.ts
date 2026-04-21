import path from "path";
export const zipTypeList = ['zip', "rar"];
export const imageTypeList = ['png', "jpg", "jpeg", "gif", "webp", "apng"];
export const contentTypeList = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    apng: 'image/apng'
};

export function getContentType(name: string) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (contentTypeList[ext]) {
        return contentTypeList[ext as keyof typeof contentTypeList];
    }
    return 'application/octet-stream';
}