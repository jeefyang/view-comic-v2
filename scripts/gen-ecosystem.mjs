// scripts/gen-ecosystem.mjs
// pnpm build 的最后一步：根目录没有 ecosystem.config.cjs 时，从 example 复制一份。
//
// ecosystem.config.cjs 是「本机私有」的（端口、日志路径等按机器改），所以不进 git；
// example 才进 git。复制出来之后按需改，不会被构建覆盖。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleFile = path.join(root, "ecosystem.config.example.cjs");
const targetFile = path.join(root, "ecosystem.config.cjs");
const logsDir = path.join(root, "logs");

if (!fs.existsSync(exampleFile)) {
    console.error("找不到 ecosystem.config.example.cjs，跳过生成 PM2 配置。");
    process.exit(0);
}

// 日志目录：PM2 写 out_file / error_file 时不会自己建目录，缺了会报 ENOENT
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log("已创建 logs/ 目录");
}

if (fs.existsSync(targetFile)) {
    console.log("ecosystem.config.cjs 已存在，保留原文件不覆盖。");
    process.exit(0);
}

fs.copyFileSync(exampleFile, targetFile);
console.log("已根据 ecosystem.config.example.cjs 生成 ecosystem.config.cjs（可自行修改，不会被覆盖）");
