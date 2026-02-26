import { JRoute } from "../utils/jroute";
import path from 'path';
import fs from "fs";

export function useLibraryApi(router: JRoute) {

    router.post("/library/folderList", async (req, res) => {
        const { pathUrl } = req.body;
        if (!fs.existsSync(pathUrl)) {
            res.json({
                code: 500,
                msg: "文件夹不存在"
            } as JFetchReturnType);
            return;
        }
        const list = fs.readdirSync(pathUrl);
        res.json({
            code: 200,
            data: {
                list
            }
        } as JFetchReturnType);
        return;
    });


}