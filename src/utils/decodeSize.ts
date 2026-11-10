import imageSize from 'image-size';

type SizeResult = { width: number; height: number };

/** 只取图片头部 64KB 就能解析出宽高 */
const RANGE_SIZE = 65536;
/** 单个探测请求的超时时间，网络差时不至于一直挂着 */
const TIMEOUT = 8000;
/** 同时进行的探测请求上限，避免和真正的图片下载抢带宽 */
const MAX_CONCURRENT = 4;
/** 已探测结果缓存上限：重建布局、缩放窗口后同一批 URL 会再次调用 */
const CACHE_LIMIT = 500;

const sizeCache = new Map<string, SizeResult>();

let running = 0;
const waiting: (() => void)[] = [];

const acquire = (): Promise<void> => {
    if (running < MAX_CONCURRENT) {
        running++;
        return Promise.resolve();
    }
    return new Promise<void>((res) => waiting.push(res));
};

const release = () => {
    const next = waiting.shift();
    if (next) {
        // 名额直接转交给下一个等待者，running 保持不变
        next();
    } else {
        running--;
    }
};

const setCache = (url: string, size: SizeResult) => {
    if (sizeCache.size >= CACHE_LIMIT) {
        // Map 保持插入顺序，先淘汰最早的一半，避免缓存无上限增长
        const drop = Math.ceil(CACHE_LIMIT / 2);
        let count = 0;
        for (const key of sizeCache.keys()) {
            sizeCache.delete(key);
            if (++count >= drop) {
                break;
            }
        }
    }
    sizeCache.set(url, size);
};

const abortError = () => new DOMException('Aborted', 'AbortError');

const fetchSize = async (url: string, signal?: AbortSignal): Promise<[SizeResult | undefined, any]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
        const response = await fetch(url, {
            headers: {
                'Range': `bytes=0-${RANGE_SIZE - 1}`
            },
            signal: controller.signal
        });
        if (!response.ok) {
            return [undefined, response.statusText];
        }
        const body = response.body;
        if (!body) {
            return [undefined, '响应没有可读取的内容'];
        }
        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
            while (total < RANGE_SIZE) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                if (!value || value.byteLength === 0) {
                    continue;
                }
                const remain = RANGE_SIZE - total;
                const part = value.byteLength > remain ? value.subarray(0, remain) : value;
                chunks.push(part);
                total += part.byteLength;
            }
        }
        finally {
            // 只读到图片头部就取消，别把整张图（甚至 zip 视频）拖下来
            await reader.cancel().catch(() => undefined);
        }
        if (total === 0) {
            return [undefined, '响应为空'];
        }
        if (response.status === 206) {
            const contentRange = response.headers.get('content-range');
            const matched = contentRange ? /^bytes\s+0-(\d+)\/(\d+)$/i.exec(contentRange.trim()) : null;
            if (!matched) {
                return [undefined, 'Content-Range 无效'];
            }
            const end = Number(matched[1]);
            const declaredSize = Number(matched[2]);
            if (!Number.isFinite(end) || !Number.isFinite(declaredSize) || end < 0 || end >= declaredSize) {
                return [undefined, 'Content-Range 无效'];
            }
            const expected = Math.min(RANGE_SIZE, end + 1);
            if (total < expected) {
                // 声明了更大的范围却提前结束：宁可让调用方回退，也不拿半张图解析
                return [undefined, '响应被截断'];
            }
        }
        const data = new Uint8Array(total);
        let offset = 0;
        for (const part of chunks) {
            data.set(part, offset);
            offset += part.byteLength;
        }
        const sizeData = imageSize(data);
        if (!sizeData.width || !sizeData.height) {
            return [undefined, '无法解析图片尺寸'];
        }
        const size: SizeResult = { width: sizeData.width, height: sizeData.height };
        setCache(url, size);
        return [size, undefined];
    } catch (error) {
        return [undefined, error];
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
};

/**
 * 用 Range 请求只读取图片头部，解析真实宽高。
 * @param url 图片地址
 * @param signal 可选，页面被回收时用来取消还没发出的请求
 */
export async function decodeSize(url: string, signal?: AbortSignal): Promise<[SizeResult | undefined, any]> {
    const cached = sizeCache.get(url);
    if (cached) {
        // 命中后挪到队尾，保持“最近使用”的顺序
        sizeCache.delete(url);
        sizeCache.set(url, cached);
        return [cached, undefined];
    }
    if (signal?.aborted) {
        return [undefined, abortError()];
    }
    await acquire();
    try {
        if (signal?.aborted) {
            return [undefined, abortError()];
        }
        // 排队期间可能已被别处探测过
        const cachedAfterWait = sizeCache.get(url);
        if (cachedAfterWait) {
            return [cachedAfterWait, undefined];
        }
        return await fetchSize(url, signal);
    } finally {
        release();
    }
}
