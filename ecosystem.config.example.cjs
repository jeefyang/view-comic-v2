// ecosystem.config.example.cjs
// PM2 配置示例：pnpm build 时若根目录没有 ecosystem.config.cjs，会自动复制这份并生成。
// 复制出来的那份才是实际使用的，按机器改完不会被构建覆盖。
//
//   pm2 start ecosystem.config.cjs
//   pm2 logs view-comic-v2
//
// 注意：ecosystem.config.cjs 用 .cjs 后缀，因为 package.json 是 "type": "module"。
const path = require("node:path");

module.exports = {
    apps: [
        {
            name: "view-comic-v2",
            // 生产入口 = 构建产物（由 server/prod.ts 编译而来），dist 目录自包含
            // 用绝对路径，不依赖 PM2 对相对路径的解析规则（相对 script 是相对 cwd 解析的）
            script: path.join(__dirname, "dist/server/prod.mjs"),
            cwd: __dirname,
            exec_mode: "fork",
            instances: 1,
            env: {
                // 与 .env 的 PORT 保持一致；PM2 注入的环境变量优先级高于 .env
                PORT: 6006,
                NODE_ENV: "production"
            },

            // 等应用发出 'ready' 信号（server/prod.mjs 在 listen 成功后 process.send('ready')）
            wait_ready: true,
            listen_timeout: 10000,
            kill_timeout: 5000,

            // 每 3 天凌晨 4 点重启一次（PM2 的 cron 语义：跨月时可能只隔 1 天）
            cron_restart: "0 4 */3 * *",
            restart_delay: 2000,
            max_memory_restart: "1G",

            // 崩溃自动重启；5 秒内连续崩 10 次就放弃，避免把 CPU 跑满
            autorestart: true,
            min_uptime: "5s",
            max_restarts: 10,

            // 日志：logs/ 由 scripts/gen-ecosystem.mjs 在构建时创建
            out_file: path.join(__dirname, "logs/out.log"),
            error_file: path.join(__dirname, "logs/error.log"),
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        }
    ]
};
