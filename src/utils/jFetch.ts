export async function jFetch(o: { method: "GET" | "POST", url: string, data?: any; }) {
    const headers = new Headers({
        "Content-Type": "application/json",

    });
    const list: { method: typeof o.method, fn: () => Promise<Response>; }[] = [
        {
            method: "GET",
            fn: () => {
                const param = new URLSearchParams(o.data || {});
                return fetch(o.url + "?" + param, {
                    method: o.method,
                    headers
                });
            }
        },
        {
            method: "POST",
            fn: () => {
                return fetch(o.url, {
                    method: o.method,
                    headers,
                    body: JSON.stringify(o.data || {}),
                });
            }

        }
    ];
    const item = list.find(c => c.method == o.method);
    if (!item) {
        return { code: -1, msg: `暂不支持此 ${o.method} 请求` };
    }
    try {
        const res = await item.fn();
        if (res.status == 401) {
            console.log("请登录");
        }
        return res.json();
    }
    catch (e) {
        console.warn(e);
        return { code: 666, msg: "请求失败", err: e };
    }
}