import fs from "fs";
import path from "path";

/**
 * target 是否位于 root 之内（允许与 root 相等）。
 *
 * 用 path.relative 比较而不是 startsWith：
 * - Windows 下 relative 不区分大小写，能挡住 `C:\LIB` / `C:\lib` 这类大小写绕过；
 * - 能正确区分 `C:\a` 与 `C:\ab` 这种前缀相同的兄弟目录。
 */
export function isInsideRoot(root: string, target: string) {
    const rel = path.relative(root, target);
    if (rel === "") {
        return true;
    }
    if (rel === ".." || rel.startsWith(".." + path.sep)) {
        return false;
    }
    return !path.isAbsolute(rel);
}

/**
 * 把用户提供的相对路径拼到书库根目录下，并保证结果没有越出根目录。
 *
 * 越界时返回 null（包括经由符号链接 / junction 指向根目录之外的情况），
 * 由调用方决定回什么状态码。
 */
export function resolveInsideRoot(rootPath: string, relativePath: string): string | null {
    const root = path.resolve(rootPath);
    // 注意用 resolve 而不是 join：如果 relativePath 是绝对路径（如 "C:\Windows" 或 "/etc"），
    // resolve 会让它整体替换掉 root，从而被下面的越界检查拦下来。
    const target = path.resolve(root, relativePath);
    if (!isInsideRoot(root, target)) {
        return null;
    }
    try {
        // 真实路径二次校验：书库内可能存在指向根目录之外的符号链接 / junction，
        // 这类路径字符串上完全合法，只有 realpath 之后才看得出来。
        const realRoot = fs.realpathSync(root);
        const realTarget = fs.realpathSync(target);
        if (!isInsideRoot(realRoot, realTarget)) {
            return null;
        }
    }
    catch {
        // 目标不存在（或 root 暂时不可访问）时无法解析真实路径，
        // 交给调用方后续的 existsSync 判定，这里不拦截。
    }
    return target;
}
