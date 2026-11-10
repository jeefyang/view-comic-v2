/**
 * 阅读页媒体源：缓存命中优先，未命中回网络。
 *
 * 图片：命中缓存时用 Blob + objectURL；未命中直接使用原图 URL，保留渐进式首屏，
 *       等图片真正显示后再用 fetch(force-cache) 取字节写库。
 * 视频：整段 fetch -> Blob -> objectURL；超过单文件上限时退回直连，不缓存。
 *
 * 这里不依赖 Pinia，userScope 由调用方传入，避免 stores 与缓存模块循环引用。
 */
import {
    getMedia,
    getMediaCacheLimits,
    putMedia,
    type MediaKind,
    type MediaPutResult
} from "@/utils/mediaCache";

export interface OpenMediaOptions {
    /** 登录用户的 userUUID；为空时不读写缓存 */
    userScope?: string;
    /** 跳过缓存查找，用于缓存条目损坏后的回退 */
    forceNetwork?: boolean;
    signal?: AbortSignal;
}

export interface MediaSourceHandle {
    src: string;
    fromCache: boolean;
    cacheable: boolean;
    kind: MediaKind;
    /** 图片传实际加载到的 URL（可能带 retry=）；视频忽略参数 */
    commit(sourceUrl?: string): Promise<MediaPutResult>;
    release(): void;
    abort(): void;
}

const linkAbort = (parent: AbortSignal | undefined, controller: AbortController) => {
    if (!parent) {
        return;
    }
    if (parent.aborted) {
        controller.abort();
        return;
    }
    parent.addEventListener("abort", () => controller.abort(), { once: true });
};

const directImageHandle = (
    url: string,
    key: string,
    controller: AbortController
): MediaSourceHandle => {
    let committed = false;
    let committing = false;
    let released = false;
    return {
        src: url,
        fromCache: false,
        cacheable: !!key,
        kind: "image",
        async commit(sourceUrl?: string): Promise<MediaPutResult> {
            if (!key || committed || committing || released) {
                return "skipped";
            }
            committing = true;
            try {
                const response = await fetch(sourceUrl || url, {
                    cache: "force-cache",
                    credentials: "same-origin",
                    signal: controller.signal
                });
                if (!response.ok) {
                    return "skipped";
                }
                const blob = await response.blob();
                const result = await putMedia(key, blob, "image");
                if (result === "cached") {
                    committed = true;
                }
                return result;
            } catch {
                return "skipped";
            } finally {
                committing = false;
            }
        },
        release() {
            if (released) {
                return;
            }
            released = true;
            controller.abort();
        },
        abort() {
            controller.abort();
        }
    };
};

const blobHandle = (
    objectUrl: string,
    blob: Blob,
    key: string,
    kind: MediaKind,
    fromCache: boolean,
    cacheable: boolean,
    controller: AbortController
): MediaSourceHandle => {
    let committed = fromCache;
    let committing = false;
    let released = false;
    return {
        src: objectUrl,
        fromCache,
        cacheable,
        kind,
        async commit(): Promise<MediaPutResult> {
            if (!cacheable || committed || committing || released) {
                return "skipped";
            }
            committing = true;
            try {
                const result = await putMedia(key, blob, kind);
                if (result === "cached") {
                    committed = true;
                }
                return result;
            } finally {
                committing = false;
            }
        },
        release() {
            if (released) {
                return;
            }
            released = true;
            URL.revokeObjectURL(objectUrl);
            controller.abort();
        },
        abort() {
            controller.abort();
        }
    };
};

const directVideoHandle = (url: string, controller: AbortController): MediaSourceHandle => {
    let released = false;
    return {
        src: url,
        fromCache: false,
        cacheable: false,
        kind: "video",
        async commit(): Promise<MediaPutResult> {
            return "skipped";
        },
        release() {
            if (released) {
                return;
            }
            released = true;
            controller.abort();
        },
        abort() {
            controller.abort();
        }
    };
};

const openVideo = async (
    url: string,
    key: string,
    controller: AbortController
): Promise<MediaSourceHandle> => {
    try {
        const response = await fetch(url, {
            credentials: "same-origin",
            signal: controller.signal
        });
        if (!response.ok) {
            return directVideoHandle(url, controller);
        }
        const limits = await getMediaCacheLimits();
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > limits.videoCap) {
            // 不缓存的大视频不要整段下载，直接交还给 <video> 自己按需请求。
            try {
                await response.body?.cancel();
            } catch {
                // 忽略
            }
            return directVideoHandle(url, controller);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (blob.size > limits.videoCap) {
            // 没拿到 Content-Length 时只能下完再判断；仍然可以用 Blob 播放，只是不写库。
            return blobHandle(objectUrl, blob, key, "video", false, false, controller);
        }
        return blobHandle(objectUrl, blob, key, "video", false, true, controller);
    } catch (error) {
        if (controller.signal.aborted) {
            throw error;
        }
        return directVideoHandle(url, controller);
    }
};

export const openMedia = async (
    url: string,
    key: string,
    kind: MediaKind,
    options: OpenMediaOptions = {}
): Promise<MediaSourceHandle> => {
    const controller = new AbortController();
    linkAbort(options.signal, controller);
    if (!url) {
        return directVideoHandle(url, controller);
    }
    const scope = (options.userScope ?? "").trim();
    const cacheKey = key && scope ? key : "";
    if (cacheKey && !options.forceNetwork) {
        const cached = await getMedia(cacheKey);
        if (cached) {
            const objectUrl = URL.createObjectURL(cached.blob);
            return blobHandle(objectUrl, cached.blob, cacheKey, kind, true, false, controller);
        }
    }
    if (kind === "video") {
        if (!cacheKey || options.forceNetwork) {
            return directVideoHandle(url, controller);
        }
        return openVideo(url, cacheKey, controller);
    }
    return directImageHandle(url, cacheKey, controller);
};
