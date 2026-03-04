import { JRoute } from "../utils/jroute";


export function useUserApi(router: JRoute) {


    router.post('/user/login', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({
                code: 402,
                msg: '用户名/密码不能为空',
            });
            return;
        }
        
    });
}