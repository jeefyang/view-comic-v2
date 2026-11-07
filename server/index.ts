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
    app.use(helmet());
}

export { app as viteNodeApp };