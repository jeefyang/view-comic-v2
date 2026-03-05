import { JRoute } from "../utils/jroute";
import { addUser, deleteUser, editUser, getUserFromToken, readUsers, userLogin } from "../utils/user";


export function useUserApi(router: JRoute) {


    router.post('/user/login', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(402).json({
                code: 402,
                msg: '用户名/密码不能为空',
            });
            return;
        }
        const data = userLogin(username, password);
        if (data[1]) {
            res.status(403).json({
                code: 403,
                msg: data[1],
            });
            return;
        }
        const target = data[0]!;

        res.json({
            code: 200,
            data: { token: target.tokenData.token, username: target.userData.username, type: target.userData.type } as WebUserType,
        });
        return;
    });

    router.post(`/user/edit`, async (req, res) => {
        const { username, password, newPassword, newUsername } = req.body;
        if (!username || !password) {
            res.status(402).json({
                code: 402,
                msg: '用户名/密码不能为空',
            });
            return;
        }
        if (!newUsername && !newPassword) {
            res.status(402).json({
                code: 402,
                msg: '请填写需要修改的用户名/密码',
            });
            return;
        }
        const data = editUser({ editType: 'edit', username, password, newUsername, newPassword });
        if (data[1]) {
            res.status(500).json({
                code: 500,
                msg: data[1]
            });
            return;
        }
        res.json({
            code: 200,
            msg: "修改成功"
        });


    });

    router.post(`/user/add`, async (req, res) => {
        const { newUsername, adminToken, newPassword, adminUser } = req.body;
        if (!adminToken) {
            res.status(402).json({
                code: 402,
                msg: 'token不能为空',
            });
            return;

        }
        if (!newUsername || !newPassword) {
            res.status(402).json({
                code: 402,
                msg: '用户名/密码不能为空',
            });
            return;
        }
        const data = addUser({ editType: 'add', adminToken, newUsername, newPassword, adminUser });
        if (data[1]) {
            res.status(500).json({
                code: 500,
                msg: data[1]
            });
            return;
        }
        res.json({
            code: 200,
            msg: "添加成功"
        });
        return;


    });

    router.post(`/user/delete`, async (req, res) => {
        const { adminToken, adminUser, username } = req.body;
        if (!adminToken || !adminUser) {
            res.status(402).json({
                code: 402,
                msg: '管理员用户名/token不能为空',
            });
            return;

        }
        if (!username) {
            res.status(402).json({
                code: 402,
                msg: '需要删除的用户名不能为空',
            });
            return;
        }
        const data = deleteUser({ editType: 'delete', adminToken, adminUser, username });
        if (data[1]) {
            res.status(500).json({
                code: 500,
                msg: data[1]
            });
            return;
        }
        res.json({
            code: 200,
            msg: "删除成功"
        });
        return;
    });

    router.get(`/user/list`, async (req, res) => {
        const token = await router.vertifyToken(req, res);
        if (!token) {
            return;
        }
        const [user, err] = getUserFromToken(token);
        if (err) {
            res.json({
                code: 500,
                msg: err,
            } as JFetchReturnType);
            return;
        }
        if (user?.type != 'admin') {
            res.json({
                code: 502,
                msg: "权限不足",
            } as JFetchReturnType);
            return;
        }
        const users = readUsers();
        res.json({
            code: 200,
            data: users.map(c => { return { username: c.username, type: c.type }; })
        });
    });
}