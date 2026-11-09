/**
 * 容器书（PDF / EPUB / MOBI）的业务错误。
 *
 * status 只取 JFetchReturnType 里已有、语义对得上的三个：
 * 400 文件坏了 / 不是这个格式，413 文件太大，415 格式或加密不受支持。
 * 路由层把它原样翻成 code + msg，前端 msg.error(res.msg) 直接显示。
 */
export class BookError extends Error {
    status: 400 | 413 | 415;

    constructor(status: 400 | 413 | 415, message: string) {
        super(message);
        this.name = "BookError";
        this.status = status;
    }
}

export function isBookError(e: unknown): e is BookError {
    return e instanceof BookError;
}
