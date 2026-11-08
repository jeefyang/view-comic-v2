/**
 * 服务端在「书库根目录下的文件」这条路径上返回的 basePath 是 `path.join("")` 的结果 `"."`，
 * 直接拼进 URL 会得到 `api/file/<uuid>/<index>/.` 这种怪地址（虽然服务端还能解析成根目录）。
 * 这里统一归一成空串，让上层拼地址时干脆不拼这一段。
 */
export const normalizeBasePath = (value?: string | null): string => {
    // 服务端用 path.join 拼 basePath，Windows 下会带反斜杠（如 `compare\compare.zip`），
    // 反斜杠不能直接进 URL（浏览器会当成转义/路径分隔处理），统一换成斜杠。
    let v = (value ?? "").trim().replace(/\\/g, "/");
    while (v.startsWith("./")) {
        v = v.slice(2);
    }
    v = v.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
    return v === "." ? "" : v;
};

/** 文件名同理：根目录的 name 可能是 "."，当作没有名字处理 */
export const normalizeFileName = (value?: string | null): string => {
    const v = (value ?? "").trim();
    return v === "." ? "" : v;
};

/**
 * 图片地址的版本号。
 *
 * 之前服务端处理 Range 时把响应截断到 64KB 却仍回 200 + `immutable`，
 * 浏览器把这条残缺响应当成「这张图的完整内容」缓存了一年 —— 之后的 `<img>`
 * 命中缓存只能拿到前 64KB，渐进式 JPEG 于是显示成完整尺寸的糊图。
 *
 * 服务端已经改成真正的 206，但用户浏览器里那份坏缓存还在，而 URL 就是缓存键，
 * 所以加个版本号把旧的整片作废。以后地址形态有变化时改这个常量即可。
 */
export const FILE_URL_VERSION = "2";

/**
 * 统一的文件地址拼装：`api/file/<editUUID>/<index>` 后面只有 basePath 非空时才追加，
 * 避免出现结尾的 `/` 或 `/.`（两者都能被服务端解析，但不是正确形态）。
 * 末尾带版本号，见 FILE_URL_VERSION 的说明。
 */
export const buildFileUrl = (editUUID: string, index: number, basePath?: string | null): string => {
    const base = normalizeBasePath(basePath);
    const head = `api/file/${editUUID}/${index}`;
    const tail = base ? `${head}/${base}` : head;
    return `${tail}?v=${FILE_URL_VERSION}`;
};
