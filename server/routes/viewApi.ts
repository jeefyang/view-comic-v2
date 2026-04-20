import { Router } from 'express';
import { TransExpressRouter } from '@common/apis/tools/transExpressRouter';
import { ViewApiUrl } from '@common/apis/view';
import { vertifyToken } from '../utils/user';
import { getLibPathByUUID } from '../utils/library';
import fs from 'fs';
import path from "path";
import { getComicViewList, getViewFile } from '../utils/view';

export function useViewApi(router: Router) {
    const viewRouter = new TransExpressRouter(ViewApiUrl, router);

    viewRouter.setRouter("checkFolder", async (from, req, res) => {
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
        const data = getLibPathByUUID(undefined, from.editUUID);
        if (data[1]) {
            return {
                code: 500,
                msg: data[1]
            };
        }
        const url = path.join(data[0]!, from.path || "");
        if (!fs.existsSync(url)) {
            return {
                code: 404,
                data: false,
                msg: "路径不存在"
            };
        }
        return {
            code: 200,
            data: true
        };
    });

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
        const data = getLibPathByUUID(undefined, from.editUUID);
        if (data[1]) {
            return {
                code: 500,
                msg: data[1]
            };
        }

        try {
            const url = path.join(data[0]!, from.path || "");
            if (!fs.existsSync(url)) {
                return {
                    code: 404,
                    msg: "路径不存在"
                };
            }
            const list = fs.readdirSync(url);
            const fileList: ViewFileType[] = [];
            list.forEach(c => {
                const file = getViewFile(path.join(url, c));
                if (!file) {
                    return;
                }
                fileList.push(file);
            });
            return {
                data: {
                    libUUID: from.editUUID,
                    basePath: from.path,
                    list: fileList
                },
                msg: "操作成功"
            };
        }
        catch (e) {
            return {
                code: 500,
                msg: e
            };
        }
    });

    viewRouter.setRouter("comicViewList", async (from, req, res) => {

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
        const data = getLibPathByUUID(undefined, from.editUUID);
        if (data[1]) {
            return {
                code: 500,
                msg: data[1]
            };
        }

        try {
            const url = path.join(data[0]!, from.path || "");
            if (!fs.existsSync(url) || !fs.existsSync(path.join(url, from.file.name))) {
                return {
                    code: 404,
                    msg: "路径不存在"
                };
            }
            const comicData = await getComicViewList(url, from.file, from.nameEncoding);
            if (comicData[1]) {
                return {
                    code: 500,
                    msg: comicData[1]
                };
            }
            return {
                code: 200,
                data: comicData[0]
            };
        }
        catch (e) {
            return {
                code: 500,
                msg: e
            };
        }
    });
}