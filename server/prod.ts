// server/prod.ts
// 生产环境启动器：给 PM2 / systemd 这类进程管理器用。
//
//   pnpm build        # 会把它编译成 dist/server/prod.mjs
//   node dist/server/prod.mjs
//
// 做四件事：
//   1. 读项目根目录的 .env（端口、默认账号等）
//   2. 找到构建产物 dist/server/index.js（Vite SSR 打包出的 express app）并 import
//   3. 托管 dist/ 里的前端静态文件（页面与接口同一个端口，与开发期一致）
//   4. 监听端口；启动成功后给 PM2 发 'ready'（对应 ecosystem 里的 wait_ready）
//
// 这个文件是源码：改完要重新 pnpm build；PM2 跑的是 dist/server/prod.mjs（编译产物）。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import express, { type Express } from "express";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 找项目根目录：从本文件所在目录往上找第一个含 package.json 的目录。
 * 源码在 server/、产物在 dist/server/，两种位置都能找到同一个根。
 */
function findRoot(start: string): string {
    let dir = start;
    for (let i = 0; i < 5; i++) {
        if (fs.existsSync(path.join(dir, "package.json"))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return path.resolve(start, "..");
}

const root = findRoot(here);
const distDir = path.join(root, "dist");
const serverEntry = path.join(distDir, "server", "index.js");
const indexHtml = path.join(distDir, "index.html");

// 端口等配置写在项目根目录 .env；已存在的环境变量优先（PM2 的 env 会覆盖 .env）
loadEnv({ path: path.join(root, ".env") });

const PORT = Number(process.env.PORT || 6006);
const HOST = process.env.HOST || "0.0.0.0";

if (!fs.existsSync(serverEntry)) {
    console.error(`找不到服务端产物：${serverEntry}`);
    console.error("先跑 pnpm build（前端构建 → 服务端构建 → 启动器编译）。");
    process.exit(1);
}
if (!fs.existsSync(indexHtml)) {
    console.error(`找不到前端产物：${indexHtml}`);
    console.error("先跑 pnpm build。");
    process.exit(1);
}

const { viteNodeApp: app } = (await import(pathToFileURL(serverEntry).href)) as { viteNodeApp: Express };

// 前端静态资源：/api 已在 app 内部注册，这里只兜其余请求
app.use(
    express.static(distDir, {
        index: "index.html",
        // 带 hash 的资源可以长缓存；index.html 不吃缓存，避免更新后拿到旧的
        setHeaders: (res, filePath) => {
            if (filePath.endsWith("index.html")) {
                res.setHeader("Cache-Control", "no-cache");
            }
        }
    })
);

// 兜底：非 /api 的 GET/HEAD 一律回 index.html（hash 路由下基本用不到，防一手）
app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
        return next();
    }
    if (req.path.startsWith("/api")) {
        return next();
    }
    res.sendFile(indexHtml);
});

const httpServer = http.createServer(app);

httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
        console.error(`\n端口 ${PORT} 已被占用 —— 可能已经有一个实例在跑了。`);
        console.error("先停掉旧进程，或改 .env / ecosystem 里的 PORT 再试。\n");
    } else {
        console.error("服务启动失败：", err);
    }
    process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
    console.log(`\n  ➜  本地:   http://localhost:${PORT}/`);
    console.log(`  ➜  接口:   http://localhost:${PORT}/api/  （与页面同一端口）`);
    console.log(`  ➜  环境:   ${process.env.NODE_ENV || "production"}\n`);
    // PM2 的 wait_ready 需要这个信号，否则会等满 listen_timeout 判失败
    if (typeof process.send === "function") {
        process.send("ready");
    }
});

function shutdown(signal: string): void {
    console.log(`收到 ${signal}，正在关闭…`);
    httpServer.close(() => process.exit(0));
    // 兜底：10 秒还没关完就强退（长连接 / 大文件下载时可能出现）
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
