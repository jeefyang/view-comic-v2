import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';


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
    port: 3000
  }
});