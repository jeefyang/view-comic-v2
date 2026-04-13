
import path from 'path';
import fs from "fs";
import { editLib, getList, removeLib, addLib, readLibs } from "../utils/library";
import { getUserFromToken, vertifyToken } from "../utils/user";
import { TransExpressRouter } from '@common/apis/tools/transExpressRouter';
import { Router } from 'express';
import { LibraryApiUrl } from '@common/apis/library';



export function useLibraryApi(router: Router) {
    readLibs();
    const libraryRouter = new TransExpressRouter(LibraryApiUrl, router);
    libraryRouter.setRouter('getList', async (from, req, res) => {
        const check = await vertifyToken(req, res);
        if (check) {
            return check;
        }
        const token = <string>(req.headers.token);
        const [list, err] = getList(token);
        if (err) {
            return {
                code: 200,
                err: err,
                msg: err
            };
        }
        return {
            code: 200,
            data: list,
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
            try {
                return fs.lstatSync(itemPath).isDirectory();
            }
            catch (e) {
                return false;
            }
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
        const { name, pathUrl, groupList } = from;
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
        const newData = { name, pathUrl, groupList: groupList || [] };
        const resData = addLib(newData);
        if (resData[1]) {
            return {
                code: 500,
                msg: resData[1]
            };
        }
        return {
            code: 200,
            msg: "添加成功",
            data: resData[0]
        };

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
        const { uuid } = from;
        if (!uuid) {
            return {
                code: 402,
                msg: "请完善参数"
            };
        }
        const resData = removeLib({ uuid });
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
        const { uuid, pathUrl, newName, groupList } = from;
        if (!uuid || !pathUrl) {
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
        const newData: EditLibraryType = { uuid, pathUrl, newName, groupList };
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

    libraryRouter.setRouter("update", async (from, req, res) => {
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
        const { uuid } = from;
        if (!uuid) {
            return {
                code: 402,
                msg: "请完善参数"
            };
        }

        const newData: EditLibraryType = { uuid };
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