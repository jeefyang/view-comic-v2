/**
 * 重渲染任务共用的槽位：sharp 缩略图 + 容器书（PDF / EPUB / MOBI）页图。
 *
 * 为什么合并：sharp 与 pdfjs 都是 CPU / 内存密集型，各开一份队列会让
 * 「同时 2 张缩略图 + 同时 2 页 PDF」变成 4 份峰值，PM2 的 1G 内存很快见底。
 * 语义沿用缩略图既有那一套：上限 2、排队 32、超出直接抛 RenderBusyError，
 * 由路由层翻成 503 + Retry-After，让前端退避重试。
 */

/** 同时执行的任务数 */
const MAX_GENERATE = 2;
/** 排队上限：超过就不再收 */
const MAX_WAITING = 32;

export class RenderBusyError extends Error {
    constructor(message = "渲染队列已满") {
        super(message);
        this.name = "RenderBusyError";
    }
}

let running = 0;
const waiting: (() => void)[] = [];

async function acquireSlot() {
    if (running < MAX_GENERATE) {
        running++;
        return;
    }
    if (waiting.length >= MAX_WAITING) {
        throw new RenderBusyError();
    }
    await new Promise<void>((resolve) => {
        waiting.push(resolve);
    });
    running++;
}

function releaseSlot() {
    running = Math.max(0, running - 1);
    const next = waiting.shift();
    if (next) {
        next();
    }
}

/** 在槽位里执行任务；成功、失败都会释放 */
export async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
    await acquireSlot();
    try {
        return await task();
    }
    finally {
        releaseSlot();
    }
}

/** 当前占用情况，排查「怎么一直在排队」用 */
export function renderQueueState() {
    return { running, waiting: waiting.length };
}
