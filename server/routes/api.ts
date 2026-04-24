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
    const fromPathList = req.params.fromPathList;
    if (!editUUID || !index) {
        return res.send(404);
    }
    const fromPath = path.join(...fromPathList || []);

    const num = parseInt(index);
    if (isNaN(num)) {
        return res.send(404);
    }
    const data = getLibPathByUUID(undefined, editUUID);
    if (data[1]) {
        return res.send(404);
    }
    const url = path.join(data[0]!, fromPath);
    if (!fs.existsSync(url)) {
        res.send(404);
    }
    const limitRange = req.headers.range ? parseInt(req.headers.range.split('-')[1]) : 0;
    try {
        const stat = fs.statSync(url);
        if (stat.isDirectory()) {
            const data = getComicViewListByFile([url]);
            if (data[1]) {
                return res.send(404);
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
                return res.send(404);
            }
            const obj = data[0]!;
            res.setHeader("Content-Type", getContentType(obj.fileList[num].name));
            res.setHeader("Accept-Ranges", 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

            const stream = await obj.getFileByIndex(num);
            if (!stream) {
                return res.send(404);
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

// 缩略图
router.get("/Thumbnail/:path", async (req, res) => {
    res.send(404);
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