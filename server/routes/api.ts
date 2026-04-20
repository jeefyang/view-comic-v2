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

const router: Router = Router();

useConfigApi(router);
useUserApi(router);
useLibraryApi(router);
useViewApi(router);

// 文件读取
router.get("/file/:fromPath", async (req, res) => {
    if (!req.params.fromPath) {
        return res.send(404);
    }
    const { editUUID, index } = req.query;
    if (!editUUID || index == undefined) {
        return res.send(404);
    }
    const num = parseInt(index.toString());
    const data = getLibPathByUUID(undefined, editUUID.toString());
    if (data[1]) {
        return res.send(404);
    }
    const url = path.join(data[0]!, req.params.fromPath);
    if (!fs.existsSync(url)) {
        res.send(404);
    }
    const stat = fs.statSync(url);
    if (stat.isDirectory()) {
        const data = getComicViewListByFile(url);
        if (data[1]) {
            return res.send(404);
        }

        const fileP = path.join(url, data[0]!.list[num].name);
        res.setHeader("Content-Type", getContentType(fileP));
        fs.createReadStream(fileP).pipe(res);
    }
    else {
        const data = await getMyStreamZip(url);
        if (data[1]) {
            return res.send(404);
        }

        res.setHeader("Content-Type", getContentType(data[0]!.fileList[num].name));
        (await data[0]?.getFileByIndex(num))?.pipe(res);

    }
    require("fs").existsSync(url) && require("fs").createReadStream(url).pipe(res);
    res.send(404);
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