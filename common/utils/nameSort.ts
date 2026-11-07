/**
 * 文件排序工具：书架、阅读页共用。
 * 全部是纯函数，不修改传入的数组（返回新数组）。
 */

type SortableFile = {
    name: string;
    size?: number;
    /** 服务端返回的是字符串，也可能是毫秒数 */
    updateTime?: number | string;
    createTime?: number | string;
    /** 有的地方已经算好毫秒时间戳，优先用它 */
    updateTimeMS?: number;
    createTimeMS?: number;
};

/** numeric:false —— 按字符顺序，img-10 会排在 img-2 前面 */
const nameCollator = new Intl.Collator("zh-CN", { sensitivity: "base", numeric: false });

const diff = (a: number, b: number) => a - b;

const timeValue = (value?: number | string): number => {
    if (typeof value === "number") {
        return value;
    }
    if (!value) {
        return 0;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const updateTimeOf = (file: SortableFile) => file.updateTimeMS ?? timeValue(file.updateTime);
const createTimeOf = (file: SortableFile) => file.createTimeMS ?? timeValue(file.createTime);

/** 按字符顺序比较文件名 */
export const compareName = (a: string, b: string) => nameCollator.compare(a, b);

/**
 * 取出名字里的所有数字段（去掉扩展名），每段去掉前导零。
 * 例：`img-001.jpg` → ["1"]、`第1话-010.jpg` → ["1","10"]、`cover.jpg` → []。
 * 用字符串保存而不是 Number，避免超长数字超出安全整数。
 */
const numberParts = (name: string): string[] =>
    (name.replace(/\.[^./\\]+$/, "").match(/\d+/g) ?? []).map((part) => part.replace(/^0+/, ""));

/** 比较两段数字字符串：先比位数再比字典序（等价于比数值，且不怕大数） */
const compareDigitPart = (a: string, b: string) => {
    if (a.length !== b.length) return a.length - b.length;
    if (a === b) return 0;
    return a < b ? -1 : 1;
};

/**
 * 按「有效数字」比较文件名：
 * 从第一段数字开始逐段比较（`adboc66` 的 66 比 `ahjt42` 的 42 大，所以 42 在前）；
 * 前面几段都相同时，数字段多的排后面（`1 - 副本` 在 `1 - 副本 (2)` 之前）；
 * 所有数字段都一样才按文件名比较；没有数字的排最后。
 */
export const compareNumber = (a: string, b: string) => {
    const pa = numberParts(a);
    const pb = numberParts(b);
    if (!pa.length && !pb.length) return compareName(a, b);
    if (!pa.length) return 1;
    if (!pb.length) return -1;
    const len = Math.min(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const result = compareDigitPart(pa[i]!, pb[i]!);
        if (result) return result;
    }
    if (pa.length !== pb.length) return pa.length - pb.length;
    return compareName(a, b);
};

/**
 * 按指定规则排序。
 * type: name 字符顺序 / number 有效数字 / updateTime 更新时间 / createTime 创建时间 / size 体积 / extension 扩展名
 * order: 1 正序，-1 反序
 */
export const sortFileList = <T extends SortableFile>(list: readonly T[], type: SortNameType, order: 1 | -1 = 1): T[] => {
    const compare = (a: T, b: T): number => {
        switch (type) {
            case "updateTime":
                return diff(updateTimeOf(a), updateTimeOf(b)) || compareNumber(a.name, b.name);
            case "createTime":
                return diff(createTimeOf(a), createTimeOf(b)) || compareNumber(a.name, b.name);
            case "size":
                return diff(a.size || 0, b.size || 0) || compareNumber(a.name, b.name);
            case "name":
            case "extension":
                return compareName(a.name, b.name) || compareNumber(a.name, b.name);
            case "number":
            default:
                return compareNumber(a.name, b.name);
        }
    };
    // 乘以 order 而不是排完再 reverse：reverse 会把「比较结果相同的项」的原始顺序也翻过来
    return [...list].sort((a, b) => order * compare(a, b));
};
