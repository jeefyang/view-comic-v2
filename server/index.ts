import type { Express } from 'express';
import express from 'express';
import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'node:url';

const app: Express = express();

app.get('/api/data', (_req, res) => {
    res.json({ message: 'pnpm + Express 运行中' });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
    try {
        const vite = await createServer({
            server: { middlewareMode: true },
            configFile: path.resolve(__dirname, '../vite.config.ts')
        });
        app.use(vite.middlewares);
        console.log('Vite 开发服务器中间件已加载');
    } catch (error) {
        console.error('Vite 中间件加载失败:', error);
        process.exit(1);
    }
})();

export { app as viteNodeApp };