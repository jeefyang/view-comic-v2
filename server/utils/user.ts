import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { addTokenCache, tokenCache, User_FILE } from './cache';
import { nanoid } from "nanoid";


const saltRounds = 12;
let userCache: JsonUser[] = [];

export function filterUsers(list: JsonUser[], target?: Partial<JsonUser>) {
    if (!target) {
        return list;
    }
    return list.filter(item => {
        for (const key in target) {
            //@ts-expect-error
            if (item[key] !== target[key]) {
                return false;
            }
        }
        return true;
    });
}

function initUsers(): JsonUser[] {

    try {
        // 如果 config.json 已存在，直接读取
        if (fs.existsSync(User_FILE)) {
            const data = fs.readFileSync(User_FILE, 'utf8');
            return JSON.parse(data);
        }

        // === 首次初始化 ===
        console.log('没找到用户的数据文件,正在初始化');

        // 从 .env 读取默认值
        const defaultUsername = process.env.DEFAULT_USERNAME?.trim() || '';
        const defaultPassword = process.env.DEFAULT_PASSWORD?.trim() || '';

        if (!defaultUsername || !defaultPassword) {
            throw new Error('默认用户名或密码未设置');
        }

        // 哈希密码
        const passwordHash = bcrypt.hashSync(defaultPassword, saltRounds);

        const newUser: JsonUser = {
            username: defaultUsername,
            passwordHash,
            initialized: true,
            type: "admin",
            uuid: nanoid(24),
            createTime: new Date().getTime(),
        };

        // 写入 config.json
        updateUsers([newUser]);
        console.log(`✅ 自动初始化管理员用户: ${defaultUsername}`);
        return [newUser];
    } catch (err) {
        console.error('❌ 初始化用户失败:', err);
        // 返回一个安全的默认配置（但 initialized=false，前端可提示用户手动初始化）
        return [];
    }
}

export function readUsers(target?: Partial<JsonUser>): JsonUser[] {

    if (userCache.length == 0) {
        userCache = initUsers();
    }
    return filterUsers(userCache, target);
}

export function addUser(editData: EditUserType): [JsonUser | undefined, any] {
    try {
        const list = readUsers();
        if (list.length == 0) {
            throw new Error('用户数据库未初始化');
        }
        // 验证
        // 管理员模式
        if (editData.adminUser) {
            const adminUser = list.find(item => item.type === 'admin');
            if (adminUser?.username != editData.adminUser) {
                return [undefined, '管理员用户名错误'];
            }
            if (!editData.adminToken) {
                return [undefined, '管理员用户令牌错误'];
            }
            const adminToken = tokenCache.find(c => c.uuid == adminUser.uuid && c.token == editData.adminToken)?.token;
            if (!adminToken) {
                return [undefined, '管理员用户令牌错误,请重新登录`'];
            }
        }
        else {
            return [undefined, '请选择管理员用户'];
        }
        if (!editData.newUsername || !editData.newPassword) {
            return [undefined, '用户名或密码不能为空'];
        }
        const item = list.find(item => item.username === editData.newUsername);
        if (item) {
            return [undefined, '用户名已存在'];
        }
        // 哈希密码
        const passwordHash = bcrypt.hashSync(editData.newPassword, saltRounds);

        const newUser: JsonUser = {
            username: editData.newUsername,
            passwordHash,
            initialized: true,
            type: "user",
            uuid: nanoid(24),
            createTime: new Date().getTime(),
        };
        list.push(newUser);

        updateUsers(list);
        return [newUser, undefined];
    } catch (err) {
        console.error('❌ 添加用户失败:', err);
        return [undefined, err];
    }
}

export function updateUsers(list: JsonUser[]) {
    userCache = list;
    fs.writeFileSync(User_FILE, JSON.stringify(list, null, 4), 'utf8');

}

/** 验证用户 */
export function verifyUser(token: string) {
    return tokenCache.findIndex(c => c.token == token) != -1;
}

export function editUser(editData: EditUserType): [JsonUser | undefined, any] {
    try {
        const list = readUsers();
        if (list.length == 0) {
            throw new Error('用户数据库未初始化');
        }
        // 验证
        if (!editData.username || !editData.password) {
            return [undefined, '用户名或密码不能为空'];
        }

        const index = list.findIndex(item => item.username === editData.username);
        if (index == -1) {
            return [undefined, '用户不存在'];
        }
        const item = { ...list[index] };
        if (!bcrypt.compareSync(editData.password, item.passwordHash)) {
            return [undefined, '密码错误'];
        }
        // 修改用户名
        if (editData.newUsername) {
            const item2 = list.find(item => item.username === editData.newUsername);
            if (item2?.uuid && item2.uuid != item.uuid) {
                return [undefined, '用户名已存在'];
            }
            item.username = editData.newUsername;
        }
        if (editData.newPassword) {
            // 哈希密码
            const passwordHash = bcrypt.hashSync(editData.newPassword, saltRounds);
            item.passwordHash = passwordHash;
        }
        item.modifyTime = new Date().getTime();
        list[index] = item;
        updateUsers(list);
        return [item, undefined];
    } catch (err) {
        console.error('❌ 修改用户失败:', err);
        return [undefined, err];
    }
}

export function deleteUser(editData: EditUserType): [JsonUser | undefined, any] {
    try {
        const list = readUsers();
        if (list.length == 0) {
            throw new Error('用户数据库未初始化');
        }
        // 验证
        // 管理员模式
        if (editData.adminUser) {
            const adminUser = list.find(item => item.type === 'admin');
            if (adminUser?.username != editData.adminUser) {
                return [undefined, '管理员用户名错误'];
            }
            if (!editData.adminToken) {
                return [undefined, '管理员用户令牌错误'];
            }
            const adminToken = tokenCache.find(c => c.uuid == adminUser.uuid && c.token == editData.adminToken)?.token;
            if (!adminToken) {
                return [undefined, '管理员用户令牌错误,请重新登录`'];
            }
        }
        else {
            return [undefined, '请选择管理员用户'];
        }
        if (!editData.username) {
            return [undefined, '用户名不能为空'];
        }
        const index = list.findIndex(item => item.username === editData.username);
        if (index == -1) {
            return [undefined, '用户不存在'];
        }
        const item = list[index];
        if (item.type == 'admin') {
            return [undefined, '不能删除管理员用户'];
        }
        list.splice(index, 1);
        updateUsers(list);
        return [item, undefined];

    } catch (err) {
        console.error('❌ 删除用户失败:', err);
        return [undefined, err];
    }
}

export function userLogin(username: string, password: string): [{ tokenData: UserTokenType, userData: JsonUser; } | undefined, any] {
    const list = readUsers();
    const user = list.find(item => item.username === username);
    if (!user) {
        return [undefined, '用户不存在'];
    }

    if (!bcrypt.compareSync(password, user.passwordHash)) {
        return [undefined, '密码错误'];
    }

    const obj: UserTokenType = {
        uuid: user.uuid, token: nanoid(128)
        , createTime: new Date().getTime()
    };
    addTokenCache(obj);
    return [{ tokenData: obj, userData: user }, undefined];
}

export function getUserFromToken(token: string): [JsonUser | undefined, any] {
    const index = tokenCache.findIndex(c => c.token == token);
    if (index == -1) {
        return [undefined, 'token不存在'];
    }
    const item = tokenCache[index];
    const user = userCache.find(c => c.uuid == item.uuid);
    if (!user) {
        return [undefined, '用户不存在'];
    }
    return [user, undefined];
}