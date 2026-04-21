import { imageTypeList, zipTypeList } from "@common/utils/ext";
import StreamZip from "node-stream-zip";
import { getFileExt, getSizeStr } from ".";
import iconv from "iconv-lite";
import { nanoid } from "nanoid";


const maxCount = 10;
const list: { p: string, stream: MyStreamZip; nameEncoding?: string; }[] = [];

class MyStreamZip {

    obj: StreamZip.StreamZipAsync | undefined = undefined;
    fileList: ComicFileType[] = [];
    curEntries: StreamZip.ZipEntry[] = [];
    updateTime: number = -1;
    isWork = false;
    protected finishStreamFnList: { uuid: string, fn: () => void; }[] = [];
    constructor(public p: string, public nameEncoding?: string) {
        if (!this.nameEncoding) {
            this.nameEncoding = process.env.DEFAULT_ZIPCODE?.trim();
        }
        this.create();
    }

    private create() {
        this.obj = new StreamZip.async({ file: this.p, nameEncoding: this.nameEncoding });
        this.updateTime = new Date().getTime();
    }


    async init() {
        this.isWork = true;
        const entries = await this.obj?.entries() || {};
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
        await this.obj.close();
        this.obj = undefined;
        this.fileList = [];
        this.curEntries = [];
        return true;
    }

    async getFileByIndex(index: number) {
        if (!this.obj) {
            return;
        }
        const stream = await this.obj.stream(this.curEntries[index]);
        return stream;
    }

    async rebuild(nameEncoding?: string) {
        this.isWork = true;
        if (this.obj) {
            await this.obj.close();
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

export async function getMyStreamZip(p: string, nameEncoding?: string, deleteIndex = 0): Promise<[MyStreamZip | undefined, any]> {
    if (!nameEncoding) {
        nameEncoding = process.env.DEFAULT_ZIPCODE?.trim();
    }
    try {
        for (let i = 0; i < list.length; i++) {
            if (list[i].p == p) {
                if (list[i].nameEncoding != nameEncoding) {
                    await list[i].stream.rebuild(nameEncoding);
                }
                return [list[i].stream, undefined];
            }
        }
        if (list.length >= maxCount) {
            const check = await list[deleteIndex].stream.close();
            if (!check) {
                return getMyStreamZip(p, nameEncoding, deleteIndex + 1);
            }
            list.shift();
            return getMyStreamZip(p);
        }
        const zip = new MyStreamZip(p);
        list.push({ p, stream: zip, nameEncoding: nameEncoding });
        await zip.init();
        return [zip, undefined];
    }
    catch (e) {
        return [undefined, e];
    }

}