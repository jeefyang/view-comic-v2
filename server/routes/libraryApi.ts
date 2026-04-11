
import path from 'path';
import fs from "fs";
import { editLib, getList, removeLib, addLib } from "../utils/library";
import { getUserFromToken, vertifyToken } from "../utils/user";
import { TransExpressRouter } from '@common/apis/tools/transExpressRouter';
import { Router } from 'express';
import { LibraryApiUrl } from '@common/apis/library';



export function useLibraryApi(router: Router) {
    const libraryRouter = new TransExpressRouter(LibraryApiUrl, router);
    libraryRouter.setRouter('getList', async (from, req, res) => {
        const check = await vertifyToken(req, res);
        if (check) {
            return check;
        }
        return {
            code: 200,
            data: getList(),
            msg: "获取成功"

        };
    });

    libraryRouter.setRouter("folderList", async (from, req, res) => {
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
        const { pathUrl } = from;

        if (!pathUrl || !fs.existsSync(pathUrl)) {
            return {
                code: 501,
                msg: "文件夹不存在"
            };
        }
        let list = fs.readdirSync(pathUrl);
        list = list.filter(item => {
            const itemPath = path.join(pathUrl, item);
            return fs.lstatSync(itemPath).isDirectory();
        });
        return {
            code: 200,
            data: {
                list
            }
        };
    });

    libraryRouter.setRouter("folderTest", async (from, req, res) => {
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
        const { pathUrl } = from;
        if (!pathUrl) {
            return {
                code: 402,
                msg: "请完善参数"
            };
        }
        if (!fs.existsSync(pathUrl)) {
            return {
                code: 501,
                msg: "文件夹不存在"
            };
        }
        return {
            code: 200,
            msg: "测试成功"
        };
    });

    libraryRouter.setRouter("add", async (from, req, res) => {
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
        const { name, pathUrl } = from;
        if (!pathUrl || !name) {
            return {
                code: 402,
                msg: "请完善参数"
            };
        }
        if (!fs.existsSync(pathUrl) || !fs.lstatSync(pathUrl).isDirectory()) {
            return {
                code: 501,
                msg: "文件夹不存在"
            };
        }
        const newData = { name, pathUrl };
        const resData = addLib(newData);
        if (resData[1]) {
            return {
                code: 500,
                msg: resData[1]
            };
        }
        res.json({
            code: 200,
            msg: "添加成功",
            data: resData[0]
        });
        if (user?.type != 'admin') {
            return {
                code: 502,
                msg: "权限不足",
            };
        }
    });

    libraryRouter.setRouter("remove", async (from, req, res) => {
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
        const { name } = from;
        if (!name) {
            return {
                code: 402,
                msg: "请完善参数"
            };
        }
        const resData = removeLib({ name });
        if (resData[1]) {
            return {
                code: 500,
                msg: resData[1]
            };
        }
        return {
            code: 200,
            msg: "删除成功",
            data: resData[0]
        };
    });

    libraryRouter.setRouter("edit", async (from, req, res) => {
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
        const { name, pathUrl, newName } = from;
        if (!name || !pathUrl) {
            return {
                code: 402,
                msg: "请完善参数"
            };
        }
        if (!fs.existsSync(pathUrl) || !fs.lstatSync(pathUrl).isDirectory()) {
            return {
                code: 501,
                msg: "文件夹不存在"
            };
        }
        const newData: EditLibraryType = { name, pathUrl, newName };
        const resData = editLib(newData);
        if (resData[1]) {
            return {
                code: 500,
                msg: resData[1]
            };
        }
        return {
            code: 200,
            msg: "修改成功",
            data: resData[0]
        };
    });

}