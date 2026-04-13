import { apiUrlsTrans, type ResSendType } from "./apiUrlsTrans";
import { Router, type Response, type Request } from 'express';

export class TransExpressRouter<T extends ReturnType<typeof apiUrlsTrans>> {
    constructor(public transObj: T, public router: Router) {

    }

    setRouter<K extends keyof T>(key: K, cb: (from: T[K]["from"], req: Request, res: Response) => Promise<ResSendType<T[K]["to"]>>) {
        const item = this.transObj[key];
        const fn = async (from: any, req: any, res: any) => {
            try {
                const data = await cb(from, req, res);
                if (data.err) {
                    const code = data.code || 500;
                    res.status(code).json({
                        code: code,
                        msg: data.msg || "服务器错误",
                        err: data.err
                    });
                    return;
                }
                const code = data.code || 200;
                res.status(code).json({
                    code: code,
                    msg: data.msg || "操作成功",
                    data: data.data
                });
            }
            catch (err) {
                const code = 503;
                res.status(code).json({
                    code: code,
                    msg: "服务器数据冲突",
                    err: err
                });
                return;
            }
        };
        if (item?.method == "GET") {
            this.router.get("/"+item.url, async (req, res) => {

                const from = req.query as T[keyof T]["from"];
                await fn(from, req, res);
                return;
            });
        }
        else if (item?.method == "POST") {
            this.router.post("/"+item.url, async (req, res) => {
                const from = req.body as T[keyof T]["from"];
                await fn(from, req, res);
                return;
            });
        }
    }
}
