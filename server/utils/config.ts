// server/utils/config.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { CONFIG_FILE, DATA_DIR } from './cache';

/**
 * 读取配置，如果不存在则自动初始化
 */
export function readConfig(): JsonConfig {
    try {
        // 如果 config.json 已存在，直接读取
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data) as JsonConfig;
        }
        // === 首次初始化 ===
        console.log('🆕 初始化配置');

        const newConfig: JsonConfig = {

        };
        // 写入 config.json
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 4), 'utf8');
        return newConfig;
    } catch (err) {
        console.error('❌ Failed to read or initialize config:', err);
        // 返回一个安全的默认配置（但 initialized=false，前端可提示用户手动初始化）
        return {

        } as JsonConfig;
    }
}

export function writeConfig(config: JsonConfig): void {
    try {

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4), 'utf8');
    } catch (err) {
        console.error('❌ Failed to write config:', err);
        throw err;
    }
}