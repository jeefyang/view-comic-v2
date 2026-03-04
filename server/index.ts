// server/index.ts
import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'vite';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'node:url';

import router from './routes/api';
import { readConfig } from './utils/config';
import { readUsers } from './utils/user';

const app: Express = express();
readConfig();
readUsers();

app.use(cors());
app.use(express.json());
app.use('/api', router);

app.get('/health', (_req, res) => {
    res.json({ status: 'OK' });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
    (async () => {
        try {
            // ✅ 1. 创建原生 HTTP 服务器（必须！）
            const httpServer = http.createServer(app);

            // ✅ 2. 启动 Vite，传入 httpServer（Vite 5+ 标准方式）
            const vite = await createServer({
                server: {
                    middlewareMode: true,
                    // 在 Vite 7/8 中，也可以显式指定 hmr.server
                    hmr: {
                        server: httpServer
                    }
                },
                configFile: path.resolve(__dirname, '../vite.config.ts'),
                root: path.resolve(__dirname, '..')
            });

            // ✅ 3. 挂载中间件
            app.use(vite.middlewares);

            // ✅ 4. 监听端口
            const PORT = parseInt(process.env.PORT || '5173');
            httpServer.listen(PORT, () => {
                console.log(`🚀 Dev server running on http://localhost:${PORT}`);
            });
        } catch (error) {
            console.error('❌ Server startup failed:', error);
            process.exit(1);
        }
    })();
}
else {
    app.use(helmet());

}
export { app as viteNodeApp };