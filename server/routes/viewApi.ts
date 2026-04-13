import { Router } from 'express';
import { TransExpressRouter } from '@common/apis/tools/transExpressRouter';
import { ViewApiUrl } from '@common/apis/view';
import { vertifyToken } from '../utils/user';
import { getLibPathByUUID } from '../utils/library';
import fs from 'fs';
import path from "path";
import { getViewFile } from '../utils/view';

export function useViewApi(router: Router) {
    const viewRouter = new TransExpressRouter(ViewApiUrl, router);

    viewRouter.setRouter("folder", async (from, req, res) => {
        const check = await vertifyToken(req, res);
        if (check) {
            return check;
        }
        if (!from.editUUID) {
            return {
                code: 402,
                msg: "缺少editUUID"
            };
        }
        if (!from.path) {
            return {
                code: 402,
                msg: "缺少path"
            };
        }
        const data = getLibPathByUUID(undefined, from.editUUID);
        if (data[1]) {
            return {
                code: 500,
                msg: data[1]
            };
        }

        try {
            const url = path.join(data[0]!, from.path);
            if (!fs.existsSync(url)) {
                return {
                    code: 404,
                    msg: "路径不存在"
                };
            }
            const list = fs.readdirSync(url);
            const fileList: ViewFileType[] = []
            list.every(c => {
                const file = getViewFile(path.join(url, c))
                if (!file) {
                    return
                }
                fileList.push(file)
            })
            return {
                data: fileList,
                msg: "操作成功"
            }
        }
        catch (e) {
            return {
                code: 500,
                msg: e
            };
        }
    });
}