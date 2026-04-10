import type { apiUrlsTrans } from "./apiUrlsTrans";

type EventType = "afterFetch";
// 1. 提取事件处理函数的类型
type EventListener<T extends ReturnType<typeof apiUrlsTrans>> = <K extends keyof T>(
    key: K,
    res?: {
        code?: number;
        msg?: string;
        data?: T[K]["to"];
        err?: any;
    }
) => Promise<any>;

export class TransFetch<T extends ReturnType<typeof apiUrlsTrans>> {

    constructor(public transObj: T) {

    }

    protected eventList: {
        [x in EventType]?
        : EventListener<T>[]
    } = {};

    addListener(type: EventType, fn: EventListener<T>
    ) {
        if (!this.eventList[type]) {
            this.eventList[type] = [];
        }
        this.eventList[type]!.push(fn);
    }

    removeListener(type: EventType, fn: EventListener<T>
    ) {
        if (!this.eventList[type]) {
            return;
        }
        const index = this.eventList[type]!.indexOf(fn);
        if (index > -1) {
            this.eventList[type]!.splice(index, 1);
        }
    }

    getHeaderFn: <K extends keyof T>(key: K) => Promise<HeadersInit | undefined> = async () => undefined;
    async request<K extends keyof T>(key: K, data?: T[K]["from"]): Promise<{
        code?: number,
        msg?: string,
        data?: T[K]["to"];
        err?: any;
    }> {
        const item = this.transObj[key];
        if (!item) {
            //@ts-expect-error
            throw new Error(`${key} not found`);
        }
        let url = item.url;
        if (item.method == "GET" && data) {
            url += "?" + new URLSearchParams(data).toString();
        }
        const headers = await this.getHeaderFn(key);
        const res = await (await fetch(url, { method: item.method, body: item.method == "POST" ? JSON.stringify(data) : undefined, headers: headers })).json();
        if (this.eventList["afterFetch"]) {
            for (const fn of this.eventList["afterFetch"]!) {
                if (await fn(key, res)) {
                    break;
                }
            }
        }
        return res;
    }

}