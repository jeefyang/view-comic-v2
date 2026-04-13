export function apiUrlsTrans<F extends any, T extends any, D extends { [x in string]: {
    method: "GET" | "POST";
    from?: F;
    to?: T;
} }>(headerUrl: string, o: D): { [x in keyof D]: {
    url: string;
} & D[x]; } {
    const newO = {} as { [x in keyof D]: { url: string; } & D[x] };
    for (const key in o) {
        const c = o[key as keyof D] || {};
        //@ts-expect-error
        newO[key as keyof D] = { url: headerUrl + key, ...c };

    }
    return newO;
}

export type ResSendType<T> = {
    code?: number;
    msg?: string;
    data?: T;
    err?: any;
};
