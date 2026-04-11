import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';
import { fileURLToPath, URL } from 'node:url';



export default defineConfig({
    plugins: [
        ...VitePluginNode({
            adapter: 'express',
            appPath: './server/index.ts',
            exportName: 'viteNodeApp',
        })
    ],
    server: {
        // 后端进程跑在 3000，对外不可见，只给前端 Proxy 用
        port: 3000,
        host: '0.0.0.0'
    },
    resolve: {
        alias: {
            "@common": fileURLToPath(new URL('./common', import.meta.url)),
        }
    }
});