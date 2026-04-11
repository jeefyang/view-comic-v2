import { readConfig } from '../utils/config';
import { Router } from 'express';
import { TransExpressRouter } from '@common/apis/tools/transExpressRouter';
import { ConfigApiUrl } from '@common/apis/config';
import { vertifyToken } from '../utils/user';

export function useConfigApi(router: Router) {

    const configRouter = new TransExpressRouter(ConfigApiUrl, router);
    configRouter.setRouter("getConfig", async (from, req, res) => {
        const check = await vertifyToken(req, res);
        if (check) {
            return check;
        }
        const config = readConfig();
        return {
            code: 200,
            data: config
        };
    });


};