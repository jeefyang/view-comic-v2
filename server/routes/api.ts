import { Router } from 'express';
import { useConfigApi } from './configApi.js';
import { useUserApi } from './userApi.js';
import { useLibraryApi } from "./libraryApi.js";
import { useViewApi } from './viewApi.js';
import { getLibCache, getLibPathByUUID } from '../utils/library.js';
import fs from 'fs';
import path from "path";
import { getComicViewList, getDirMediaList } from '../utils/view.js';
import { getFileExt } from '../utils/index.js';
import { getMyStreamZip } from '../utils/myStreamZip.js';
import { getContentType } from '@common/utils/ext.js';
import { resolveInsideRoot } from '../utils/pathSafe.js';
import { getThumbBuffer, ThumbBusyError } from '../utils/thumb.js';
import { bookKindOf, getBookPageBuffer } from '../utils/book/index.js';
import { isBookError } from '../utils/book/errors.js';
import { RenderBusyError } from '../utils/renderQueue.js';

const router: Router = Router();

useConfigApi(router);
useUserApi(router);
useLibraryApi(router);
useViewApi(router);

interface ByteRange {
    start: number;
    end: number;
}

/**
 * 解析单段 `Range: bytes=start-end`。
 * - 没有 Range 头：返回 undefined（按完整内容发）
 * - 语法错误 / 越界：返回 "invalid"（回 416）
 *
 * 以前这里用的是「把上游流截断到 N 字节」的写法，但状态码还是 200，
 * 浏览器会把这个残缺响应当成完整内容缓存（还带着 immutable），
 * 之后 <img> 命中缓存只能拿到前 64KB —— 渐进式 JPEG 于是显示成
 * 完整尺寸的一团糊图。Range 必须按 HTTP 语义回 206 + Content-Range。
 */
const parseRange = (header: string | undefined, size: number): ByteRange | "invalid" | undefined => {
    if (!header) {
        return undefined;
    }
    const matched = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!matched) {
        return "invalid";
    }
    const startStr = matched[1];
    const endStr = matched[2];
    if (startStr === "" && endStr === "") {
        return "invalid";
    }
    let start: number;
    let end: number;
    if (startStr === "") {
        // 后缀范围 bytes=-N：最后 N 个字节
        const suffix = parseInt(endStr, 10);
        if (!Number.isFinite(suffix) || suffix <= 0) {
            return "invalid";
        }
        start = Math.max(0, size - suffix);
        end = size - 1;
    }
    else {
        start = parseInt(startStr, 10);
        end = endStr === "" ? size - 1 : parseInt(endStr, 10);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size) {
        return "invalid";
    }
    end = Math.min(end, size - 1);
    if (end < start) {
        return "invalid";
    }
    return { start, end };
};

/** 按范围把可读流写回响应：有 Range 回 206 + Content-Range，没有就回 200 + Content-Length */
const sendStream = (res: any, o: {
    size: number;
    contentType: string;
    rangeHeader?: string;
    open: (start: number, end: number) => NodeJS.ReadableStream;
}) => {
    res.setHeader("Content-Type", o.contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    const range = parseRange(o.rangeHeader, o.size);
    if (range === "invalid") {
        res.setHeader("Content-Range", `bytes */${o.size}`);
        res.status(416).end();
        return;
    }
    if (!range) {
        res.setHeader("Content-Length", String(o.size));
        res.status(200);
        o.open(0, o.size - 1).pipe(res);
        return;
    }
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${o.size}`);
    res.setHeader("Content-Length", String(range.end - range.start + 1));
    res.status(206);
    o.open(range.start, range.end).pipe(res);
};

/**
 * zip 条目前缀响应：只发送前 end+1 字节。
 *
 * node-stream-zip 只能把条目边解压边发，不能 seek；图片尺寸探测只需要 64KB，
 * 所以到量后必须销毁解压流，不能为了一个 Range 请求把整张图解压完。
 */
const sendZipPrefix = (res: any, stream: NodeJS.ReadableStream, end: number, onDone: () => void) => {
    const target = end + 1;
    let sent = 0;
    let settled = false;

    const cleanup = () => {
        if (settled) {
            return;
        }
        settled = true;
        stream.removeListener("data", onData);
        stream.removeListener("end", onEnd);
        stream.removeListener("error", onError);
        res.removeListener("drain", onDrain);
        res.removeListener("close", onClose);
        try {
            (stream as any).destroy?.();
        }
        catch {
            // 流已经结束/销毁：忽略
        }
        onDone();
    };

    const finish = (endResponse: boolean) => {
        if (settled) {
            return;
        }
        cleanup();
        if (endResponse && !res.writableEnded) {
            res.end();
        }
    };

    function onData(chunk: Buffer) {
        if (settled) {
            return;
        }
        const remain = target - sent;
        if (remain <= 0) {
            finish(true);
            return;
        }
        const part = chunk.length > remain ? chunk.subarray(0, remain) : chunk;
        sent += part.length;
        let canContinue: boolean;
        try {
            canContinue = res.write(part);
        }
        catch (e) {
            console.error("写压缩包前缀失败:", e);
            finish(false);
            return;
        }
        if (sent >= target) {
            finish(true);
            return;
        }
        if (!canContinue) {
            (stream as any).pause?.();
        }
    }

    function onDrain() {
        (stream as any).resume?.();
    }

    function onEnd() {
        if (sent < target) {
            console.error(`压缩包条目读取提前结束：需要 ${target} 字节，实际 ${sent} 字节`);
            finish(false);
            if (!res.writableEnded) {
                res.destroy();
            }
            return;
        }
        finish(true);
    }

    function onError(err: Error) {
        console.error("读取压缩包条目时出错:", err);
        finish(false);
        if (!res.writableEnded) {
            res.destroy();
        }
    }

    function onClose() {
        finish(false);
    }

    res.on("drain", onDrain);
    res.on("close", onClose);
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
    (stream as any).resume?.();
};

// 文件读取
router.get("/file/:editUUID/:index{/*fromPathList}", async (req, res) => {
    const editUUID = req.params.editUUID;
    const index = req.params.index;
    // Express 5 的 `*xxx` 通配参数在运行时是「路径片段数组」，
    // 但类型声明里是 string，这里两种形态都兜住。
    const rawFromPath = req.params.fromPathList as unknown;
    const fromPathList: string[] = Array.isArray(rawFromPath)
        ? rawFromPath.filter((s): s is string => typeof s === 'string')
        : typeof rawFromPath === 'string' ? [rawFromPath] : [];
    if (!editUUID || !index) {
        return res.sendStatus(404);
    }

    const num = parseInt(index);
    if (isNaN(num)) {
        return res.sendStatus(404);
    }
    const data = getLibPathByUUID(undefined, editUUID);
    if (data[1]) {
        return res.sendStatus(404);
    }
    // 下面压缩包分支会用 `data` 接 getMyStreamZip，这里先把书库根留住，
    // 否则同一个块里再写 `data[0]` 会撞上 TDZ（块级变量未初始化）
    const libRoot = data[0]!;
    // 把片段拼成相对路径后整体解析，确认最终路径仍在书库根目录内。
    // 否则 `../` 这类片段可以顺着书库根一路读到磁盘上的任意文件。
    const url = resolveInsideRoot(libRoot, path.join(...fromPathList));
    if (!url) {
        return res.sendStatus(404);
    }
    if (!fs.existsSync(url)) {
        return res.sendStatus(404);
    }
    try {
        const stat = fs.statSync(url);
        if (stat.isDirectory()) {
            const list = getDirMediaList(url, stat);
            if (num < 0 || num >= list.length) {
                return res.sendStatus(404);
            }

            const fileP = path.join(url, list[num]!.name);
            let fileStat: ReturnType<typeof fs.statSync>;
            try {
                fileStat = fs.statSync(fileP);
            }
            catch {
                // 清单与文件系统之间被删掉：越界/缺页一律 404，不要冒成 500
                return res.sendStatus(404);
            }
            if (!fileStat.isFile()) {
                return res.sendStatus(404);
            }
            sendStream(res, {
                size: fileStat.size,
                contentType: getContentType(fileP),
                rangeHeader: req.headers.range,
                open: (start, end) => {
                    const fileStream = fs.createReadStream(fileP, { start, end });
                    fileStream.on('error', (err) => {
                        console.error('读取文件时出错:', err);
                        if (!res.headersSent) {
                            res.status(500).end();
                        }
                    });
                    return fileStream;
                }
            });
            return;
        }
        else {
            const extData = getFileExt(url);
            // 容器书（PDF / EPUB / MOBI）：页要现渲染，绝不能当普通文件把整份字节发出去。
            // 序号越界回 404，与目录 / 压缩包两条链路一致。
            const bookKind = bookKindOf(extData.extType);
            if (bookKind) {
                const lib = getLibCache().find((item) => item.editUUID === editUUID);
                if (!lib) {
                    return res.sendStatus(404);
                }
                try {
                    const page = await getBookPageBuffer({
                        kind: bookKind,
                        libName: lib.name,
                        absPath: url,
                        relPath: path.relative(libRoot, url),
                        index: num
                    });
                    if (!page) {
                        return res.sendStatus(404);
                    }
                    // 渲染结果是一张独立 JPEG，和 zip 条目一样忽略 Range 回 200 全量：
                    // 截断后还回 200 会被浏览器当成完整内容长期缓存
                    res.setHeader("Content-Type", getContentType(`page.${page.ext}`));
                    res.setHeader("Accept-Ranges", 'bytes');
                    res.setHeader("Content-Length", String(page.buffer.length));
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    return res.status(200).end(page.buffer);
                }
                catch (e) {
                    if (isBookError(e)) {
                        return res.status(e.status).send(e.message);
                    }
                    if (e instanceof RenderBusyError) {
                        res.setHeader("Retry-After", "3");
                        return res.sendStatus(503);
                    }
                    console.error("读取电子书页失败:", url, e);
                    return res.status(500).send("页面渲染失败");
                }
            }
            // 普通文件（单张图片 / 视频）：直接按文件流返回。
            // 以前这里不看类型，一律当压缩包打开 —— 在书架根目录点开一张图片时，
            // node-stream-zip 会拿 JPEG 当 zip 解析并抛 `Bad archive`，
            // 它是个未捕获的 'error' 事件，会把整个进程带下去（列表/缩略图/图片全部连带 404）。
            if (extData.extType !== "zip") {
                sendStream(res, {
                    size: stat.size,
                    contentType: getContentType(url),
                    rangeHeader: req.headers.range,
                    open: (start, end) => {
                        const fileStream = fs.createReadStream(url, { start, end });
                        fileStream.on('error', (err) => {
                            console.error('读取文件时出错:', err);
                            if (!res.headersSent) {
                                res.status(500).end();
                            }
                        });
                        return fileStream;
                    }
                });
                return;
            }
            const data = await getMyStreamZip(url);
            if (data[1]) {
                // 坏包 / 加密包：只让这一个请求失败，不要让异常冒到进程级
                console.error('打开压缩包失败:', url, data[1]);
                return res.status(500).send('压缩包无法读取');
            }
            const obj = data[0]!;
            if (num < 0 || num >= obj.fileList.length) {
                return res.sendStatus(404);
            }
            const entry = obj.fileList[num]!;
            const stream = await obj.getFileByIndex(num);
            if (!stream) {
                return res.sendStatus(404);
            }
            // 视频不是图片：不做 206 切片，也不能宣告 Accept-Ranges（zip 根本不能 seek）。
            // 首版只接受 200 全量，浏览器会把整段视频缓冲下来再播。
            if (entry.extType === "video") {
                res.setHeader("Content-Type", getContentType(entry.name));
                res.setHeader("Content-Length", String(entry.size));
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.status(200);
                stream.pipe(res);
                stream.on('end', () => {
                    obj.finishStream();
                });
                return;
            }
            // node-stream-zip 不能 seek，但图片尺寸探测只读前 64KB：
            // 只有「从 0 开始的前缀 Range」可以真回 206，到量后销毁解压流。
            // 其他 Range（非 0 起点、多段等）仍按 HTTP 语义忽略，回 200 全量。
            res.setHeader("Content-Type", getContentType(entry.name));
            res.setHeader("Accept-Ranges", 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            const range = parseRange(req.headers.range, entry.size);
            if (range && range !== "invalid" && range.start === 0) {
                res.setHeader("Content-Range", `bytes 0-${range.end}/${entry.size}`);
                res.setHeader("Content-Length", String(range.end + 1));
                res.status(206);
                sendZipPrefix(res, stream, range.end, () => obj.finishStream());
                return;
            }
            res.setHeader("Content-Length", String(entry.size));
            res.status(200);
            stream.pipe(res);
            stream.on('end', () => {
                obj.finishStream();
            });
        }
    }
    catch (error) {
        res.status(500).send('文件读取失败');
    }

});

// 缩略图（按需生成：命中磁盘直接返回，没命中才解码一次并落盘）
router.get("/Thumbnail/:editUUID/:width{/*fromPathList}", async (req, res) => {
    const editUUID = req.params.editUUID;
    const width = parseInt(String(req.params.width));
    const rawFromPath = req.params.fromPathList as unknown;
    const fromPathList: string[] = Array.isArray(rawFromPath)
        ? rawFromPath.filter((s): s is string => typeof s === 'string')
        : typeof rawFromPath === 'string' ? [rawFromPath] : [];
    if (!editUUID || isNaN(width)) {
        return res.sendStatus(404);
    }

    try {
        const buffer = await getThumbBuffer(editUUID, fromPathList.join("/"), width);
        if (!buffer) {
            return res.sendStatus(404);
        }
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.end(buffer);
    }
    catch (e) {
        // 生成队列满了：告诉前端「等会儿再来」，不要当成「这张图没有缩略图」
        if (e instanceof ThumbBusyError) {
            res.setHeader("Retry-After", "3");
            return res.sendStatus(503);
        }
        console.error("读取缩略图失败:", e);
        return res.sendStatus(404);
    }
});

// 2. 【关键】在所有路由之后，定义 404 处理中间件
router.use((req, res) => {
    // 设置状态码为 404
    res.status(404);

    // 根据需求返回不同格式的响应
    // 例如，返回 JSON (适合 API)
    res.json({
        code: 404,
        msg: "请求不存在",
        err: {
            path: req.originalUrl
        }
    });
});

export default router;