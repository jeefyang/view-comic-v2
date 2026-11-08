
import { TransExpressRouter } from "@common/apis/tools/transExpressRouter.js";
import { addUser, deleteUser, editUser, editUserGroup, getUserConfig, getUserFromToken, getUserGroupList, patchBookmarks, patchReadHistory, patchTapZoneLayout, readUsers, updateUserConfigs, userLogin, vertifyToken } from "../utils/user.js";
import { Router } from 'express';
import { UserApiUrl } from "@common/apis/user";


export function useUserApi(router: Router) {

    const userRouter = new TransExpressRouter(UserApiUrl, router);

    userRouter.setRouter("login", async (from, req, res) => {
        const { username, password } = from;
        if (!username || !password) {
            return {
                code: 402,
                msg: '用户名/密码不能为空',
            };
        }
        const data = userLogin(username, password);
        if (data[1]) {
            return {
                code: 403,
                msg: data[1],
            };
        }
        const target = data[0]!;
        return {
            code: 200,
            data: { token: target.tokenData.token, username: target.userData.username, type: target.userData.type, group: target.userData.group, uuid: target.userData.uuid },
        };

    });

    userRouter.setRouter("edit", async (from, req, res) => {
        const { userUUID, password, newPassword, newUsername } = from;
        if (!userUUID || !password) {
            return {
                code: 402,
                msg: '用户uuid/密码不能为空',
            };
        }
        if (!newUsername && !newPassword) {
            return {
                code: 402,
                msg: '请填写需要修改的用户名/密码',
            };
        }
        const data = editUser({ editType: 'edit', userUUID, password, newUsername, newPassword });
        if (data[1]) {
            return {
                code: 500,
                msg: data[1],
            };
        }
        return {
            code: 200,
            msg: "修改成功"
        };
    });

    userRouter.setRouter("editGroup", async (from, req, res) => {
        const { userUUID, adminToken, adminUUID, group } = from;
        if (!userUUID) {
            return {
                code: 402,
                msg: '用户uuid不能为空',
            };
        }
        if (!group) {
            return {
                code: 402,
                msg: '请填写需要修改的分组',
            };
        }

        const data = editUserGroup({ editType: 'editGroup', userUUID, adminToken, adminUUID, group });
        if (data[1]) {
            return {
                code: 500,
                msg: data[1],
            };
        }
        return {
            code: 200,
            msg: "修改成功"
        };
    });

    userRouter.setRouter("groupList", async (from, req, res) => {
        return {
            code: 200,
            data: getUserGroupList()
        };
    });

    userRouter.setRouter("add", async (from, req, res) => {
        const { newUsername, adminToken, newPassword, adminUUID, group } = from;
        if (!adminToken) {
            return {
                code: 402,
                msg: 'token不能为空',
            };
        }
        if (!newUsername || !newPassword) {
            return {
                code: 402,
                msg: '用户名/密码不能为空',
            };
        }
        const data = addUser({ editType: 'add', adminToken, newUsername, newPassword, adminUUID, group });
        if (data[1]) {
            return {
                code: 500,
                msg: data[1],
            };
        }
        return {
            code: 200,
            msg: "添加成功"
        };
    });

    userRouter.setRouter("delete", async (from, req, res) => {
        const { adminToken, adminUUID, userUUID } = from;
        if (!adminToken || !adminUUID) {
            return {
                code: 402,
                msg: '管理员用户uuid/token不能为空',
            };
        }
        if (!userUUID) {
            return {
                code: 402,
                msg: '需要删除的用户名uuid不能为空',
            };
        }
        const data = deleteUser({ editType: 'delete', adminToken, adminUUID, userUUID });
        if (data[1]) {
            return {
                code: 500,
                msg: data[1],
            };
        }
        return {
            code: 200,
            msg: "删除成功"
        };
    });

    userRouter.setRouter("setUserConfig", async (from, req, res) => {
        const check = await vertifyToken(req, res);
        if (check) {
            return check;
        }

        const token = <string>(req.headers.token);
        const [user, err] = getUserFromToken(token);
        if (err) {
            return {
                code: 500,
                msg: err,
            };
        }
        if (from.userUUID !== user?.uuid) {
            return {
                code: 502,
                msg: "用户uuid不正确",
            };
        }
        const data = updateUserConfigs(from);
        return {
            data
        };
    });

    /**
     * 三个增量接口共用：校验 token 并取回当前用户。
     * 返回 `[user, error]`，error 不为空时调用方直接把它当响应体返回。
     */
    const resolveConfigUser = async (req: any, res: any): Promise<[WebUserType | undefined, any]> => {
        const check = await vertifyToken(req, res);
        if (check) {
            return [undefined, check];
        }
        const token = <string>(req.headers.token);
        const [user, err] = getUserFromToken(token);
        if (err) {
            return [undefined, { code: 500, msg: err }];
        }
        return [user, undefined];
    };

    /** 增量接口统一入口：校验 → 交给 utils 里的 patch 函数合并 → 返回整份配置 */
    const runConfigPatch = async (req: any, res: any, userUUID: string, apply: () => UserConfigType) => {
        const [user, err] = await resolveConfigUser(req, res);
        if (err) {
            return err;
        }
        if (userUUID !== user?.uuid) {
            return { code: 502, msg: "用户uuid不正确" };
        }
        return { data: apply() };
    };

    userRouter.setRouter("patchHistory", async (from, req, res) => {
        return await runConfigPatch(req, res, from.userUUID, () =>
            patchReadHistory({
                userUUID: from.userUUID,
                op: from.op,
                item: from.item,
                id: from.id,
            })
        );
    });

    userRouter.setRouter("patchBookmarks", async (from, req, res) => {
        return await runConfigPatch(req, res, from.userUUID, () =>
            patchBookmarks({
                userUUID: from.userUUID,
                op: from.op,
                item: from.item,
                id: from.id,
            })
        );
    });

    userRouter.setRouter("patchTapZoneLayout", async (from, req, res) => {
        return await runConfigPatch(req, res, from.userUUID, () =>
            patchTapZoneLayout({
                userUUID: from.userUUID,
                op: from.op,
                name: from.name,
                zones: from.zones,
            })
        );
    });

    userRouter.setRouter("getUserConfig", async (from, req, res) => {
        const check = await vertifyToken(req, res);
        if (check) {
            return { ...check, data: { userUUID: "" } };
        }

        const token = <string>(req.headers.token);
        const [user, err] = getUserFromToken(token);
        if (err) {
            return {
                code: 500,
                msg: err,
                data: { userUUID: "" }
            };
        }
        return { data: getUserConfig(user?.uuid!) };
    });

    userRouter.setRouter("list", async (from, req, res) => {
        const check = await vertifyToken(req, res);
        if (check) {
            return check;
        }

        const token = <string>(req.headers.token);
        const [user, err] = getUserFromToken(token);
        if (err) {
            return {
                code: 500,
                msg: err,
            };
        }
        if (user?.type != 'admin') {
            return {
                code: 502,
                msg: "权限不足",
            };
        }
        const users = readUsers();
        return {
            code: 200,
            data: users.map(c => { return { username: c.username, type: c.type, group: c.group, uuid: c.uuid }; })
        };
    });

}