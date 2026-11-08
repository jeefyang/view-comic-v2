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
 * 超大图的降采样边长。
 *
 * 浏览器的限制不在格式上而在解码上：Skia 单边超过约 32767px 直接解不出来，
 * 位图内存是 `宽 × 高 × 4` 字节（12000×12000 就已经 576MB），PNG 还要额外缓冲。
 * 所以边长或总像素超过安全线时，请求服务端先缩到这个边长再返回（sharp 缩放 + 磁盘缓存）。
 */
export const SAFE_IMAGE_EDGE = 12000;

/** 总像素安全线：8000 万像素（约 320MB 位图） */
export const SAFE_IMAGE_PIXELS = 80_000_000;

/** 尺寸是否已经大到该降采样 */
export const needsDownscale = (width?: number | null, height?: number | null): boolean => {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) {
        return false;
    }
    return Math.max(w, h) > SAFE_IMAGE_EDGE || w * h > SAFE_IMAGE_PIXELS;
};

/** 给已有地址追加/替换 `max`（服务端降采样边长）；传空则原样返回 */
export const withMaxEdge = (url: string, max?: number | null): string => {
    if (!url || !max) {
        return url;
    }
    // 地址里已经有正式的 max 就不动它，避免重复拼接
    if (/[?&]max=\d+/.test(url)) {
        return url;
    }
    return `${url}${url.includes("?") ? "&" : "?"}max=${max}`;
};

/**
 * 统一的文件地址拼装：`api/file/<editUUID>/<index>` 后面只有 basePath 非空时才追加，
 * 避免出现结尾的 `/` 或 `/.`（两者都能被服务端解析，但不是正确形态）。
 * 末尾带版本号，见 FILE_URL_VERSION 的说明；`maxEdge` 用于超大图降采样，见 SAFE_IMAGE_EDGE。
 */
export const buildFileUrl = (
    editUUID: string,
    index: number,
    basePath?: string | null,
    maxEdge?: number | null
): string => {
    const base = normalizeBasePath(basePath);
    const head = `api/file/${editUUID}/${index}`;
    const tail = base ? `${head}/${base}` : head;
    const url = `${tail}?v=${FILE_URL_VERSION}`;
    return maxEdge ? withMaxEdge(url, maxEdge) : url;
};
