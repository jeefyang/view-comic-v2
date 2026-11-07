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
     */
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "img-src": ["'self'", "data:", "blob:"],
                "media-src": ["'self'", "data:", "blob:"],
                "connect-src": ["'self'", "blob:"]
            }
        }
    }));
}

export { app as viteNodeApp };