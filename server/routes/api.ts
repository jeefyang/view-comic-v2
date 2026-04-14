import { Router } from 'express';
import { useConfigApi } from './configApi.js';
import { useUserApi } from './userApi.js';
import { useLibraryApi } from "./libraryApi.js";
import { useViewApi } from './viewApi.js';

const router: Router = Router();

useConfigApi(router);
useUserApi(router);
useLibraryApi(router);
useViewApi(router);

// 文件读取
router.get("/file/:path", async (req, res) => {
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