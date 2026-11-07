// server/dev.mjs
// 开发环境启动器：一个 HTTP 服务、一个端口（读 .env 的 PORT，默认 6006），页面与 /api 同源。
//
// 做什么：
//   1. 用 Vite 的 JS API 建一个 middlewareMode 的 dev server（页面、HMR、静态资源都由它处理）
//   2. 每个 /api 请求都通过 createServerModuleRunner(..., { hmr: true }) 取最新的 express app
//      —— 改 server/ 下的代码后，Vite 会让对应模块失效，下一次请求自动拿到新版本，
//         不需要重启进程，也不会像旧实现那样每次重载都去抢 5173 端口。
//
// 用法：pnpm dev

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createServer, createServerModuleRunner } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 端口等配置写在项目根目录的 .env 里（PORT=6006）
loadEnv({ path: path.join(root, ".env") });

const PORT = Number(process.env.PORT || 6006);
const HOST = process.env.HOST || "0.0.0.0";

const httpServer = http.createServer();

const vite = await createServer({
    root,
    appType: "custom",
    server: {
        middlewareMode: true,
        hmr: { server: httpServer },
    },
});

// SSR 模块执行器：hmr: true 时它会自己监听文件变更并让失效模块（含引用它的入口）
// 重新执行，所以改 server/ 下的代码后下一次请求就是新逻辑，不用重启进程。
const runner = createServerModuleRunner(vite.environments.ssr, { hmr: true });

// 取后端 app：命中执行器缓存；模块被改过则自动重新执行 server/index.ts
async function loadApp() {
    const mod = await runner.import("/server/index.ts");
    return mod.viteNodeApp;
}

function isApiRequest(url) {
    return url.startsWith("/api/") || url === "/api" || url === "/health";
}

async function serveIndexHtml(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 404;
        res.end("Not Found");
        return;
    }

    try {
        const template = await fs.readFile(path.join(root, "index.html"), "utf-8");
        const html = await vite.transformIndexHtml(req.url || "/", template);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(html);
    } catch (error) {
        vite.ssrFixStacktrace(error);
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(String((error && error.stack) || error));
    }
}

httpServer.on("request", async (req, res) => {
    const url = req.url || "/";

    try {
        if (isApiRequest(url)) {
            const app = await loadApp();
            app(req, res, (error) => {
                if (error) {
                    console.error("[dev] api 处理失败:", error);
                    if (!res.headersSent) {
                        res.statusCode = 500;
                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                    }
                    res.end(JSON.stringify({ code: 500, msg: String(error) }));
                }
            });
            return;
        }

        vite.middlewares(req, res, () => {
            void serveIndexHtml(req, res);
        });
    } catch (error) {
        console.error("[dev] 请求失败:", url, error);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        res.end(String((error && error.stack) || error));
    }
});

httpServer.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`\n端口 ${PORT} 已被占用 —— 很可能已经有一个 pnpm dev 在跑了。`);
        console.error("先关掉旧进程，或改 .env 里的 PORT 再试。\n");
    } else {
        console.error("[dev] 服务启动失败:", error);
    }
    process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
    console.log(`\n  ➜  本地:   http://localhost:${PORT}/`);
    console.log(`  ➜  接口:   http://localhost:${PORT}/api/  （与页面同一端口）`);
    console.log("  ➜  改 server/ 下的代码会自动生效，改前端走 HMR\n");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        httpServer.close();
        Promise.resolve(runner.close())
            .catch(() => {})
            .then(() => vite.close())
            .finally(() => process.exit(0));
    });
}
