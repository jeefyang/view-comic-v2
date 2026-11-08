// server/index.ts
import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import router from './routes/api.js';
import { readConfig } from './utils/config.js';
import { readUserConfigs, readUsers } from './utils/user.js';
import { readTokenCache } from './utils/cache.js';
import { readLibs } from './utils/library.js';

const app: Express = express();

// 兜底：任何漏网的异常都不该让服务「静默死掉」——pm2 只会看到一次无输出重启，
// 用户侧就是「列表加载不出来 / 图片加载一半就断 / 缩略图报错」这类连锁故障。
// 这里只记日志、不退出；真正的致命问题仍交给 pm2 的重启策略。
// 开发环境本模块会被 vite 反复重新加载，用 globalThis 标记保证只注册一次，避免监听器越积越多。
const guardFlag = globalThis as { __viewComicCrashGuard?: boolean };
if (!guardFlag.__viewComicCrashGuard) {
    guardFlag.__viewComicCrashGuard = true;
    process.on("uncaughtException", (err) => {
        console.error("[uncaughtException]", err);
    });
    process.on("unhandledRejection", (reason) => {
        console.error("[unhandledRejection]", reason);
    });
}

readConfig();
readUsers();
readUserConfigs();
readTokenCache();
readLibs();

app.use(cors());
app.use(express.json());
app.use('/api', router);


app.get('/health', (_req, res) => {
    res.json({ status: 'OK' });
});

// 开发环境：由 server/dev.mjs 启动（页面与接口同一个端口，默认 5173），
// 本模块每次请求都通过 vite.ssrLoadModule 重新取，所以改完代码不用重启；
// 这里不自建 HTTP 服务，否则会和启动器抢端口（EADDRINUSE）。
// 生产环境：由外部进程 import 本模块后自行监听端口。
if (process.env.NODE_ENV !== 'development') {
    /**
     * 生产环境才加 helmet（开发时 HTML 由 Vite 中间件返回，压根走不到这里）。
     *
     * CSP 必须显式放行 blob:：缩略图是「fetch 拿二进制 → URL.createObjectURL() → <img src="blob:...">」，
     * 而 helmet 默认的 `img-src 'self' data:` 里 `'self'` 并不匹配 blob: 协议，
     * 浏览器会直接拒绝加载（图片能拿到、但显示成 alt 文字），换浏览器也一样。
     * 同理连接 blob: 走的是 connect-src。
     *
     * HTTPS 开关：helmet 默认还带 `upgrade-insecure-requests`、HSTS、COOP 三个头，
     * 它们只在 HTTPS 下成立。用 http://ip:端口 访问时，`upgrade-insecure-requests`
     * 会让浏览器把 /assets/*.js 这类子资源自动改写成 https://，TLS 连不上 → 整站白屏
     * （控制台还会报一句 COOP 被忽略，因为来源不可信）。
     * 所以默认按「HTTP 直连」处理：关掉这三个头；真要上 HTTPS（反代或自带证书）时，
     * 在 .env 里写 HTTPS=1，它们会自动恢复。
     */
    const secureDeploy = /^(1|true|yes|on)$/i.test(process.env.HTTPS ?? "");
    const cspDirectives: Record<string, Iterable<string> | null> = {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'", "blob:"]
    };
    if (!secureDeploy) {
        // null 表示不输出这条指令
        cspDirectives["upgrade-insecure-requests"] = null;
    }
    app.use(helmet({
        contentSecurityPolicy: {
            directives: cspDirectives
        },
        strictTransportSecurity: secureDeploy ? undefined : false,
        crossOriginOpenerPolicy: secureDeploy ? undefined : false
    }));
}

export { app as viteNodeApp };