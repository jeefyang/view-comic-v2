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
 * 统一的文件地址拼装：`api/file/<editUUID>/<index>` 后面只有 basePath 非空时才追加，
 * 避免出现结尾的 `/` 或 `/.`（两者都能被服务端解析，但不是正确形态）。
 */
export const buildFileUrl = (editUUID: string, index: number, basePath?: string | null): string => {
    const base = normalizeBasePath(basePath);
    const head = `api/file/${editUUID}/${index}`;
    return base ? `${head}/${base}` : head;
};
