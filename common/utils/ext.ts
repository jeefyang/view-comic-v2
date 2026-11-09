import path from "path";
export const zipTypeList = ['zip', "rar", "cbz"];
export const imageTypeList = ['png', "jpg", "jpeg", "gif", "webp", "apng"];
/** 容器书：页在文件内部，服务端按需渲染成图（server/utils/book） */
export const pdfTypeList = ["pdf"];
export const epubTypeList = ["epub"];
/** azw3 是 mobi 家族的后续格式，处理方式相同 */
export const mobiTypeList = ["mobi", "azw3"];
export const bookTypeList = [...pdfTypeList, ...epubTypeList, ...mobiTypeList];
export const contentTypeList = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    apng: 'image/apng',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    epub: 'application/epub+zip',
    mobi: 'application/x-mobipocket-ebook',
    azw3: 'application/vnd.amazon.ebook'
};

export function getContentType(name: string) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (contentTypeList[ext]) {
        return contentTypeList[ext as keyof typeof contentTypeList];
    }
    return 'application/octet-stream';
}
