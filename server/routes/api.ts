import { Router } from 'express';
import { useConfigApi } from './configApi.js';
import { useUserApi } from './userApi.js';
import { useLibraryApi } from "./libraryApi.js";
import { useViewApi } from './viewApi.js';
import { getLibPathByUUID } from '../utils/library.js';
import fs from 'fs';
import path from "path";
import { getComicViewList, getComicViewListByFile } from '../utils/view.js';
import { getFileExt } from '../utils/index.js';
import { getMyStreamZip } from '../utils/myStreamZip.js';
import { getContentType } from '@common/utils/ext.js';
import { resolveInsideRoot } from '../utils/pathSafe.js';
import { getThumbBuffer, ThumbBusyError } from '../utils/thumb.js';
import { getScaledImage, isScalableImage } from '../utils/largeImage.js';

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
 * 超大图的降采样响应：尺寸超线时返回缩小的副本，没超就返回 false 让调用方回原图。
 * 只用于 `?max=` 且是位图的场景，Range 一律忽略（响应是重新编码的完整图）。
 */
const trySendScaled = async (
    res: any,
    source: string | Buffer,
    keySource: string,
    name: string,
    maxEdge: number
): Promise<boolean> => {
    const scaled = await getScaledImage(source, keySource, maxEdge, name);
    if (!scaled) {
        return false;
    }
    res.setHeader("Content-Type", scaled.contentType);
    res.setHeader("Content-Length", String(scaled.buffer.length));
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).end(scaled.buffer);
    return true;
};

/** 把整条解压流读成 Buffer（压缩包内条目要交给 sharp 时用） */
const readStreamToBuffer = (stream: NodeJS.ReadableStream): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });

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
    // `?max=<边长>`：超大图让服务端先缩到这个边长再回，避免浏览器解码失败
    const maxRaw = parseInt(String(req.query.max ?? ""), 10);
    const maxEdge = Number.isFinite(maxRaw) && maxRaw >= 256 && maxRaw <= 20000 ? maxRaw : 0;
    const data = getLibPathByUUID(undefined, editUUID);
    if (data[1]) {
        return res.sendStatus(404);
    }
    // 把片段拼成相对路径后整体解析，确认最终路径仍在书库根目录内。
    // 否则 `../` 这类片段可以顺着书库根一路读到磁盘上的任意文件。
    const url = resolveInsideRoot(data[0]!, path.join(...fromPathList));
    if (!url) {
        return res.sendStatus(404);
    }
    if (!fs.existsSync(url)) {
        return res.sendStatus(404);
    }
    try {
        const stat = fs.statSync(url);
        if (stat.isDirectory()) {
            const data = getComicViewListByFile([url]);
            if (data[1]) {
                return res.sendStatus(404);
            }

            const fileP = path.join(url, data[0]!.list[num].name);
            // 超大图先缩一遍再回，缩不动（本来就没超线）就继续走原链路
            if (maxEdge && isScalableImage(fileP)) {
                if (await trySendScaled(res, fileP, `dir:${fileP}`, fileP, maxEdge)) {
                    return;
                }
            }
            const fileSize = fs.statSync(fileP).size;
            sendStream(res, {
                size: fileSize,
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
        }
        else {
            const extData = getFileExt(url);
            // 普通文件（单张图片 / 视频）：直接按文件流返回。
            // 以前这里不看类型，一律当压缩包打开 —— 在书架根目录点开一张图片时，
            // node-stream-zip 会拿 JPEG 当 zip 解析并抛 `Bad archive`，
            // 它是个未捕获的 'error' 事件，会把整个进程带下去（列表/缩略图/图片全部连带 404）。
            if (extData.extType !== "zip") {
                if (maxEdge && isScalableImage(url)) {
                    if (await trySendScaled(res, url, `file:${url}`, url, maxEdge)) {
                        return;
                    }
                }
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
            const entry = obj.fileList[num];
            const stream = await obj.getFileByIndex(num);
            if (!stream) {
                return res.sendStatus(404);
            }
            // 压缩包内条目要交给 sharp 只能先整条读进内存；超大包内图另走降采样
            if (maxEdge && isScalableImage(entry.name) && entry.size <= 256 * 1024 * 1024) {
                const buffer = await readStreamToBuffer(stream);
                const scaled = await getScaledImage(buffer, `zip:${url}#${entry.name}`, maxEdge, entry.name);
                const body = scaled ? scaled.buffer : buffer;
                res.setHeader("Content-Type", scaled ? scaled.contentType : getContentType(entry.name));
                res.setHeader("Accept-Ranges", "none");
                res.setHeader("Content-Length", String(body.length));
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.status(200).end(body);
                obj.finishStream();
                return;
            }
            // node-stream-zip 只能把整条解压出来，做不了字节切片；这里忽略 Range，
            // 回 200 + 完整内容（HTTP 允许服务端忽略 Range，客户端会接受 200 的全量响应）。
            // 关键是绝不能截断后还回 200 —— 那会被浏览器当成完整内容长期缓存。
            res.setHeader("Content-Type", getContentType(entry.name));
            res.setHeader("Accept-Ranges", 'bytes');
            res.setHeader("Content-Length", String(entry.size));
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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