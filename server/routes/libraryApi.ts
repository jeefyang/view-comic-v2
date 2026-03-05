import { JRoute } from "../utils/jroute";
import path from 'path';
import fs from "fs";
import { LIBRARY_FILE } from "../utils/cache";
import { editLib, getList, removeLib, addLib } from "../utils/library";
import { getUserFromToken } from "../utils/user";

export function useLibraryApi(router: JRoute) {

    router.get("/library/getList", async (req, res) => {
        if (!await router.vertifyToken(req, res)) {
            return;
        }
        res.json({
            code: 200,
            data: getList(),
            msg:"获取成功"
        } as JFetchReturnType);
    });

    router.post("/library/folderList", async (req, res) => {
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
        const { pathUrl } = req.body as JsonLibrary;
        if (!fs.existsSync(pathUrl)) {
            res.json({
                code: 501,
                msg: "文件夹不存在"
            } as JFetchReturnType);
            return;
        }
        let list = fs.readdirSync(pathUrl);
        list = list.filter(item => {
            const itemPath = path.join(pathUrl, item);
            return fs.lstatSync(itemPath).isDirectory();
        });
        res.json({
            code: 200,
            data: {
                list
            }
        } as JFetchReturnType);
        return;
    });

    router.post("/library/folderTest", async (req, res) => {
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
        const { pathUrl } = req.body as EditLibraryType;
        if (!pathUrl) {
            res.json({
                code: 402,
                msg: "请完善参数"
            } as JFetchReturnType);
            return;
        }
        if (!fs.existsSync(pathUrl)) {
            res.json({
                code: 501,
                msg: "文件夹不存在"
            } as JFetchReturnType);
            return;
        }
        res.json({
            code: 200,
            msg: "测试成功"
        } as JFetchReturnType);
    });



    router.post("/library/add", async (req, res) => {
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
        const { name, pathUrl } = req.body as EditLibraryType;
        if (!pathUrl || !name) {
            res.json({
                code: 402,
                msg: "请完善参数"
            } as JFetchReturnType);
            return;
        }
        if (!fs.existsSync(pathUrl) || !fs.lstatSync(pathUrl).isDirectory()) {
            res.json({
                code: 501,
                msg: "文件夹不存在"
            } as JFetchReturnType);
            return;
        }
        const newData = { name, pathUrl };
        const resData = addLib(newData);
        if (resData[1]) {
            res.json({
                code: 500,
                msg: resData[1]
            } as JFetchReturnType);
            return;
        }
        res.json({
            code: 200,
            msg: "添加成功",
            data: resData[0]
        } as JFetchReturnType);
        return;
    });

    router.post("/library/remove", async (req, res) => {
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
        const { name } = req.body as EditLibraryType;
        if (!name) {
            res.json({
                code: 402,
                msg: "请完善参数"
            } as JFetchReturnType);
            return;
        }
        const resData = removeLib({ name });
        if (resData[1]) {
            res.json({
                code: 500,
                msg: resData[1]
            } as JFetchReturnType);
            return;
        }
        res.json({
            code: 200,
            msg: "删除成功",
            data: resData[0]
        } as JFetchReturnType);
        return;
    });

    router.post("/library/edit", async (req, res) => {
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
        const { name, pathUrl, newName } = req.body as EditLibraryType;
        if (!name || !pathUrl) {
            res.json({
                code: 402,
                msg: "请完善参数"
            } as JFetchReturnType);
            return;
        }
        if (!fs.existsSync(pathUrl) || !fs.lstatSync(pathUrl).isDirectory()) {
            res.json({
                code: 501,
                msg: "文件夹不存在"
            } as JFetchReturnType);
            return;
        }
        const newData: EditLibraryType = { name, pathUrl, newName };
        const resData = editLib(newData);
        if (resData[1]) {
            res.json({
                code: 500,
                msg: resData[1]
            } as JFetchReturnType);
            return;
        }
        res.json({
            code: 200,
            msg: "删除成功",
            data: resData[0]
        } as JFetchReturnType);
        return;
    });

}