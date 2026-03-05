import fs from 'fs';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../../data');
export const User_FILE = path.join(DATA_DIR, 'user.json');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
export const TOTKEN_FILE = path.join(DATA_DIR, 'totken.json');


// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('✅ Created ./data directory');
}

// 加载 .env（仅用于初始化）
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export let tokenCache: UserTokenType[] = [];
const tokenLimit = 3;

export function readTokenCache() {
    if (!fs.existsSync(TOTKEN_FILE)) {
        return;
    }
    const str = fs.readFileSync(TOTKEN_FILE, 'utf8');
    tokenCache = JSON.parse(str);
}


export function writeTokenCache() {

    fs.writeFileSync(TOTKEN_FILE, JSON.stringify(tokenCache, null, 4));
}

export function refreshTokenCache(forceWrite: boolean = false) {
    let isDel = false;
    const limitList: { [x in string]: { count: number; } } = {};
    for (let i = tokenCache.length - 1; i >= 0; i--) {
        if (!limitList[tokenCache[i].uuid]) {
            limitList[tokenCache[i].uuid] = { count: 1 };
            continue;
        }
        if (limitList[tokenCache[i].uuid].count < tokenLimit) {
            limitList[tokenCache[i].uuid].count++;
            continue;
        }
        tokenCache.splice(i, 1);
        isDel = true;
    }
    if (isDel || forceWrite) {
        writeTokenCache();
    }
}


export function addTokenCache(tokenData: UserTokenType) {
    tokenCache.push(tokenData);
    console.log("add");
    refreshTokenCache(true);
}


export function removeTokenCache(tokenData: UserTokenType) {
    const index = tokenCache.findIndex(item => item.uuid === tokenData.uuid);
    if (index === -1) {
        return;
    }
    tokenCache.splice(index, 1);
    refreshTokenCache(true);
}
