import StreamZip from "node-stream-zip";
import { getFileExt, getSizeStr } from ".";
import { nanoid } from "nanoid";



const maxCount = 10;
const list: { p: string, stream: MyStreamZip; nameEncoding?: string; }[] = [];

class MyStreamZip {

    obj: StreamZip | undefined = undefined;
    fileList: ComicFileType[] = [];
    curEntries: StreamZip.ZipEntry[] = [];
    updateTime: number = -1;
    len: number = 0;
    isWork = false;
    /** 最近一次打开/读取时的错误（坏包、截断、加密），清空后表示这个实例是健康的 */
    lastError: unknown = undefined;
    protected finishStreamFnList: { uuid: string, fn: () => void; }[] = [];
    constructor(public p: string, public nameEncoding?: string) {
        if (!this.nameEncoding) {
            this.nameEncoding = process.env.DEFAULT_ZIPCODE?.trim();
        }
        this.create();
    }

    private create() {

        this.updateTime = new Date().getTime();
        this.lastError = undefined;
    }




    async init() {
        this.isWork = true;
        this.obj = new StreamZip({ file: this.p, nameEncoding: this.nameEncoding });
        const entries: StreamZip.ZipEntry[] = [];
        let settled = false;
        let rejectOpen: (e: unknown) => void = () => { };
        // 常驻监听：node-stream-zip 在「不是 zip / 包被截断 / 加密包」时会 emit('error')。
        // 没有监听者时 Node 会把它升级成未捕获异常，直接结束整个进程 ——
        // 一个坏文件就能让整个服务瘫痪，所以这里必须接住，并且失败后把实例从缓存里剔掉。
        this.obj.on("error", (err: unknown) => {
            this.lastError = err;
            if (!settled) {
                settled = true;
                rejectOpen(err);
            }
        });
        try {
            await new Promise<void>((res, rej) => {
                rejectOpen = rej;
                this.obj!.on("ready", () => {
                    settled = true;
                    res();
                });
                this.obj!.on("entry", (entry) => {
                    entries.push(entry);
                });
            });
        }
        catch (e) {
            // 关掉半开的句柄，避免文件被占用；关闭失败无所谓（包本身就打不开）
            try {
                await this.close();
            }
            catch {
                this.obj = undefined;
            }
            this.fileList = [];
            this.curEntries = [];
            this.isWork = false;
            throw e;
        }

        this.curEntries = [];
        let len = 0;
        const incldeExts: ViewFileExtType[] = ['image', 'video'];
        let list: ComicFileType[] = [];
        for (let key in entries) {
            const entry = entries[key];
            const sizeStr = getSizeStr(entry.size);
            const extData = getFileExt(entry.name);
            if (!extData.extType || !incldeExts.includes(extData.extType)) {
                continue;
            }
            const file: ComicFileType = {
                name: entry.name,
                size: entry.size,
                sizeStr,
                ext: extData.ext,
                extType: extData.extType,
                isDir: entry.isDirectory,
                index: len,
                createTime: new Date(entry.time).toLocaleString(),
                createTimeMS: entry.time,
                updateTime: new Date(entry.time).toLocaleString(),
                updateTimeMS: entry.time,
            };
            len = list.push(file);
            this.curEntries.push(entry);
        }
        this.len = len;
        this.fileList = list;
        this.isWork = false;
    }

    getList() {
        return [...this.fileList];
    }

    async close() {
        if (!this.obj) {
            return false;
        }
        await new Promise((res, rej) => {
            this.obj!.close((err) => {
                if (err) {
                    return rej(err);
                }
                res(undefined);
            });
        });
        this.obj = undefined;
        this.fileList = [];
        this.curEntries = [];
        return true;
    }

    async getFileByIndex(index: number) {
        if (!this.obj) {
            return;
        }
        const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => {
            this.obj!.stream(this.curEntries[index], (err, stream) => {
                if (err) {
                    rej(err);
                    return;
                }
                res(stream!);
            });
        });

        return stream;
    }

    async rebuild(nameEncoding?: string) {
        this.isWork = true;
        if (this.obj) {
            await this.close();
        }
        if (nameEncoding) {
            this.nameEncoding = nameEncoding;
        }
        this.create();
        await this.init();
        this.isWork = false;
        return this;
    }

    addFinishStreamFn(fn: () => void) {
        const uuid = nanoid(8);
        this.finishStreamFnList.push({ uuid: uuid, fn });
        return uuid;
    }

    finishStream() {
        this.finishStreamFnList.forEach(c => c.fn());
    }
}

/**
 * 正在打开的压缩包。
 * 没有这张表时，首次并发访问同一个包会出事：第一个请求把「还没 init 完」的实例
 * 推进 list，后面的请求立刻命中它，拿到的 fileList 是空的 —— 缩略图会 404、
 * 阅读页会以为包里没有图片。这里让后来者等同一个 Promise。
 */
const opening = new Map<string, Promise<MyStreamZip>>();

export async function getMyStreamZip(p: string, nameEncoding?: string, deleteIndex = 0): Promise<[MyStreamZip | undefined, any]> {
    if (!nameEncoding) {
        nameEncoding = process.env.DEFAULT_ZIPCODE?.trim();
    }
    try {
        for (let i = 0; i < list.length; i++) {
            if (list[i].p == p) {
                // 上一次打开就失败过（坏包/截断/加密）：这个实例不能当命中使用，
                // 剔出缓存后走下面的重新打开流程，坏文件才会稳定地返回错误而不是崩进程。
                if (list[i].stream.lastError) {
                    list.splice(i, 1);
                    break;
                }
                if (list[i].nameEncoding != nameEncoding) {
                    await list[i].stream.rebuild(nameEncoding);
                }
                return [list[i].stream, undefined];
            }
        }
        const pending = opening.get(p);
        if (pending) {
            return [await pending, undefined];
        }
        if (list.length >= maxCount) {
            const check = await list[deleteIndex].stream.close();
            if (!check) {
                return getMyStreamZip(p, nameEncoding, deleteIndex + 1);
            }
            list.shift();
            return getMyStreamZip(p, nameEncoding);
        }
        const zip = new MyStreamZip(p);
        const task = (async () => {
            await zip.init();
            return zip;
        })();
        opening.set(p, task);
        try {
            await task;
        }
        finally {
            opening.delete(p);
        }
        list.push({ p, stream: zip, nameEncoding: nameEncoding });
        return [zip, undefined];
    }
    catch (e) {
        return [undefined, e];
    }

}