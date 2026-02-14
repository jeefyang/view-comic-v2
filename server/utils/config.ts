// server/utils/config.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../../data');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✅ Created ./data directory');
}

export interface AppConfig {
  username: string;
  passwordHash: string;
  initialized: boolean;
}

// 加载 .env（仅用于初始化）
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * 读取配置，如果不存在则自动初始化
 */
export function readConfig(): AppConfig {
  try {
    // 如果 config.json 已存在，直接读取
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data) as AppConfig;
    }

    // === 首次初始化 ===
    console.log('🆕 No config found. Initializing from .env...');

    // 从 .env 读取默认值
    const defaultUsername = process.env.DEFAULT_USERNAME?.trim() || 'admin';
    const defaultPassword = process.env.DEFAULT_PASSWORD?.trim() || '123456';

    if (!defaultUsername || !defaultPassword) {
      throw new Error('DEFAULT_USERNAME or DEFAULT_PASSWORD missing in .env');
    }

    // 哈希密码
    const saltRounds = 12;
    const passwordHash = bcrypt.hashSync(defaultPassword, saltRounds);

    const newConfig: AppConfig = {
      username: defaultUsername,
      passwordHash,
      initialized: true
    };

    // 写入 config.json
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
    console.log(`✅ Auto-initialized config with username: ${defaultUsername}`);

    return newConfig;
  } catch (err) {
    console.error('❌ Failed to read or initialize config:', err);
    // 返回一个安全的默认配置（但 initialized=false，前端可提示用户手动初始化）
    return {
      username: '',
      passwordHash: '',
      initialized: false
    };
  }
}

export function writeConfig(config: AppConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Failed to write config:', err);
    throw err;
  }
}