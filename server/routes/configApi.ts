
import bcrypt from 'bcrypt';
import { readConfig, writeConfig } from '../utils/config';
import { JRoute } from '../utils/jroute';

export function useConfigApi(router: JRoute) {

    router.get('/config', (_req, res) => {
        const config = readConfig();
        res.json({
            code: 200,
            data: {
                initialized: config.initialized,
                username: config.username
            }
        });
    });
    // 初始化
    router.post('/config/init', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ code: 400, err: 'Username and password required' });
        }

        const config = readConfig();
        if (config.initialized) {
            return res.status(400).json({ code: 400, err: 'Already initialized' });
        }

        const hash = await bcrypt.hash(password, 12);
        writeConfig({ username, passwordHash: hash, initialized: true });
        res.json({ code: 200, msg: 'Config initialized' });
    });
}