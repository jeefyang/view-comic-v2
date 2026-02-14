import { Router } from 'express';
export class JRoute {
    constructor(public route: Router) {

    }

    //@ts-expect-error
    readonly get: typeof this.route.get = (...args: Parameters<typeof this.route.get>) => {
        const c = args[0];
        const fn = args[1]
        //@ts-ignore
        args[1] = async (...argChildren) => {
            try {
                //@ts-expect-error
                await fn(...argChildren)
            }
            catch (e: any) {
                console.log(e)
                const res = argChildren[1];
                //@ts-ignore
                res.status(500).json({ code: 500, err: e.message || e, stack: import.meta.env.DEV ? e.stack || "" : "" });
            }
        }
        try {
            return this.route.get(...args);
        }
        catch (e) {
            console.log(c, 'get', '路由错误');
            console.error(e);

        }
    };

    //@ts-expect-error
    readonly post: typeof this.route.post = (...args: Parameters<typeof this.route.post>) => {
        const c = args[0];
        const fn = args[1]
        //@ts-ignore
        args[1] = async (...argChildren) => {
            try {
                //@ts-expect-error
                await fn(...argChildren)
            }
            catch (e: any) {
                const res = argChildren[1];
                //@ts-ignore
                res.status(500).json({ code: 500, err: e.message || e, stack: import.meta.env.DEV ? e.stack || "" : "" });
            }
        }
        try {
            return this.route.post(...args);
        }
        catch (e) {
            console.log(c, 'post', '路由错误');
            console.error(e);
        }
    };


}