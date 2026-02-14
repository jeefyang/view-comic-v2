// server/index.ts
import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'node:url';
import router from './routers/api';

const app: Express = express();

// 安全 & 跨域
app.use(helmet());
app.use(cors()); // 开发时允许前端访问
app.use(express.json({ limit: '10mb' }));

// 挂载 API 路由（必须在 Vite middlewares 之前！）
app.use('/api', router);

// 健康检查
app.get('/health', (_req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
    try {
        // 创建 Vite 开发服务器（middleware 模式）
        const vite = await createServer({
            server: { middlewareMode: true },
            configFile: path.resolve(__dirname, '../vite.config.ts'),
            root: path.resolve(__dirname, '..') // 项目根目录
        });

        // 挂载 Vite 中间件（处理静态资源、HMR、Vue 文件等）
        app.use(vite.middlewares);

        const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5173;
        app.listen(PORT, () => {
            console.log(`🚀 Full-stack dev server running on http://localhost:${PORT}`);
            console.log(`📁 Data directory: ${path.resolve(__dirname, '../data')}`);
        });
    } catch (error) {
        console.error('❌ Vite middleware failed to start:', error);
        process.exit(1);
    }
})();

export { app as viteNodeApp };