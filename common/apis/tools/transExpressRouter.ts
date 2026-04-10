import { apiUrlsTrans } from "./apiUrlsTrans";
import { Router } from 'express';

export class TransExpressRouter<T extends ReturnType<typeof apiUrlsTrans>> {
    constructor(public transObj: T, public router: Router) {

    }


    setRouter<K extends keyof T>(key: K, cb: (from: T[K]["from"]) => Promise<{ code?: number, msg?: string, data?: T[K]["to"]; err?: any; }>) {
        const item = this.transObj[key];
        const fn = async (from: any, res: any) => {
            try {
                const data = await cb(from);
                if (data.err) {
                    res.json({
                        code: data.code || 500,
                        msg: data.msg || "服务器错误",
                        err: data.err
                    });
                    return;
                }

                res.json({
                    code: data.code || 200,
                    msg: data.msg || "操作成功",
                    data: data.data
                });
            }
            catch (err) {
                res.json({
                    code: 500,
                    msg: "服务器错误",
                    err: err
                });
                return;
            }
        };
        if (item?.method == "GET") {
            this.router.get(item.url, async (req, res) => {
                const from = req.query as T[keyof T]["from"];
                fn(from, res);
            });
        }
        else if (item?.method == "POST") {
            this.router.post(item.url, async (req, res) => {
                const from = req.body as T[keyof T]["from"];
                fn(from, res);
            });
        }
    }
}
