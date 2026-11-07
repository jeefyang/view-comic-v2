// scripts/build-prod.mjs
// 把生产启动器 server/prod.ts 编译成 dist/server/prod.mjs。
//
// 为什么不直接 node server/prod.ts 跑：
//   - 生产机只保证有 node，不保证有 TS 运行时；
//   - 编译产物进 dist，PM2 指的就是构建产物，dist 目录自包含（除 node_modules / .env / data）。
//
// 为什么用 Vite 而不是 esbuild：esbuild 只是 vite 的间接依赖，直接 import 在 pnpm 的严格
// node_modules 布局下不一定能解析到；vite 是本项目的直接依赖，用它更稳。
import { build } from "vite";

await build({
    configFile: false,
    publicDir: false,
    logLevel: "info",
    build: {
        ssr: "server/prod.ts",
        outDir: "dist/server",
        emptyOutDir: false, // 不能清空：dist/server/index.js 是上一步刚产出的
        target: "node20",
        minify: false,
        sourcemap: false,
        rollupOptions: {
            output: {
                // 产物目录里有 package.json（type: module），.mjs 更明确一点
                entryFileNames: "prod.mjs",
                format: "es"
            }
        }
    }
});
