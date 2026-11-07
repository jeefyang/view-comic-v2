import { Router } from 'express';
import { useConfigApi } from './configApi.js';
import { useUserApi } from './userApi.js';
import { useLibraryApi } from "./libraryApi.js";
import { useViewApi } from './viewApi.js';
import { getLibPathByUUID } from '../utils/library.js';
import fs from 'fs';
import path from "path";
import { getComicViewList, getComicViewListByFile } from '../utils/view.js';
import { getMyStreamZip } from '../utils/myStreamZip.js';
import { getContentType } from '@common/utils/ext.js';
import { resolveInsideRoot } from '../utils/pathSafe.js';
import { getThumbBuffer, ThumbBusyError } from '../utils/thumb.js';
import stream from "stream";
import { Readable } from "stream";

const router: Router = Router();

useConfigApi(router);
useUserApi(router);
useLibraryApi(router);
useViewApi(router);

const getLimitStream = (o: {
    fileStream?: fs.ReadStream,
    zipStream?: NodeJS.ReadableStream;
    maxLimit: number;
}) => {
    let bytesSent = 0;
    const limiterStream = new stream.PassThrough({
        // 当有数据要通过时触发
        transform(chunk, encoding, callback) {
            // 如果已经达到或超过限制，直接停止
            if (bytesSent >= o.maxLimit) {
                // 销毁上游的 sourceStream，停止从压缩包读取数据
                // curStream.destroy();
                if (o.fileStream) {
                    o.fileStream.destroy();
                }
                if (o.zipStream) {
                    o.zipStream.pause();
                    o.zipStream.unpipe();
                }

                // 结束当前的 limiterStream
                this.push(null);
                return;
            }

            // 计算当前这个 chunk 有多少字节是可以发送的
            const bytesToSend = Math.min(chunk.length, o.maxLimit - bytesSent);

            // 只推送允许发送的那部分数据
            this.push(chunk.slice(0, bytesToSend));
            bytesSent += bytesToSend;

            callback();
        }
    });
    return limiterStream;
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
    // 把片段拼成相对路径后整体解析，确认最终路径仍在书库根目录内。
    // 否则 `../` 这类片段可以顺着书库根一路读到磁盘上的任意文件。
    const url = resolveInsideRoot(data[0]!, path.join(...fromPathList));
    if (!url) {
        return res.sendStatus(404);
    }
    if (!fs.existsSync(url)) {
        return res.sendStatus(404);
    }
    const limitRange = req.headers.range ? parseInt(req.headers.range.split('-')[1]) : 0;
    try {
        const stat = fs.statSync(url);
        if (stat.isDirectory()) {
            const data = getComicViewListByFile([url]);
            if (data[1]) {
                return res.sendStatus(404);
            }

            const fileP = path.join(url, data[0]!.list[num].name);
            res.setHeader("Content-Type", getContentType(fileP));
            res.setHeader("Accept-Ranges", 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

            // res.setHeader("Content-Length", data[0]!.list[num].size);
            const stream = fs.createReadStream(fileP);
            // pipeline(stream, res, err => {
            //     if (err) {
            //         console.error('读取文件时出错:', err);
            //     }
            //     if (!res.headersSent) {
            //         res.status(500).send('传输中断');
            //     }
            // });
            if (limitRange) {

                const limitStream = getLimitStream({ maxLimit: limitRange, fileStream: stream });
                stream.pipe(limitStream).pipe(res);
            }
            else {
                stream.pipe(res);
            }

            stream.on('error', (err) => {
                console.error('读取文件时出错:', err);
            });

        }
        else {
            const data = await getMyStreamZip(url);
            if (data[1]) {
                return res.sendStatus(404);
            }
            const obj = data[0]!;
            res.setHeader("Content-Type", getContentType(obj.fileList[num].name));
            res.setHeader("Accept-Ranges", 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

            const stream = await obj.getFileByIndex(num);
            if (!stream) {
                return res.sendStatus(404);
            }
            // stream.pipe(res);
            if (limitRange) {

                const limitStream = getLimitStream({ maxLimit: limitRange, zipStream: stream });
                stream.pipe(limitStream).pipe(res);
            }
            else {
                stream.pipe(res);
            }
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