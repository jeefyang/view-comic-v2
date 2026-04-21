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
import { pipeline } from 'stream';

const router: Router = Router();

useConfigApi(router);
useUserApi(router);
useLibraryApi(router);
useViewApi(router);

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
    try {
        const stat = fs.statSync(url);
        if (stat.isDirectory()) {
            const data = getComicViewListByFile([url]);
            if (data[1]) {
                return res.send(404);
            }

            const fileP = path.join(url, data[0]!.list[num].name);
            res.setHeader("Content-Type", getContentType(fileP));
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
            stream.pipe(res);
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
            res.setHeader("Content-Length", obj.fileList[num].size);
            const stream = await obj.getFileByIndex(num);
            if (!stream) {
                return res.send(404);
            }
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