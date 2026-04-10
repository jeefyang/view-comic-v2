
import bcrypt from 'bcrypt';
import { readConfig, writeConfig } from '../utils/config.js';
import { JRoute } from '../utils/jroute.js';

export function useConfigApi(router: JRoute) {
    router.get('/config', async (req, res) => {
        if (!await router.vertifyToken(req, res)) {
            return;
        }
        const config = readConfig();
        res.json({
            code: 200,
            data: config
        });
    });

};