import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { videoTypeList } from "@common/utils/ext.js";

/** 单次截图最多等这么久；超时就杀掉，不能让 ffmpeg 卡住整个渲染队列 */
const FRAME_TIMEOUT_MS = 15_000;
const MAX_STDERR = 8 * 1024;

/** 本进程内已经确认过「找不到 ffmpeg」，后续不再反复 spawn */
let ffmpegUnavailable = false;
let warnedMissing = false;

export function isVideoName(name: string) {
    return videoTypeList.includes(path.extname(name).slice(1).toLowerCase());
}

/**
 * ffmpeg 的查找顺序：
 * 1. .env 里的 FFMPEG_PATH（生产环境最稳，显式指定）
 * 2. PATH 里的 ffmpeg
 * 3. Windows 本机 Chocolatey 的常见安装位置（开发机不想配 PATH 时的兜底）
 *
 * 没有把 Linux 的路径写死：服务端在 Linux 上跑，apt/brew 安装后通常就在 PATH 里。
 */
function ffmpegCandidates() {
    const explicit = process.env.FFMPEG_PATH?.trim();
    if (explicit) {
        return [explicit];
    }
    const candidates = ["ffmpeg"];
    if (process.platform === "win32") {
        candidates.push("C:/ProgramData/chocolatey/lib/ffmpeg-full/tools/ffmpeg/bin/ffmpeg.exe");
        candidates.push("C:/ProgramData/chocolatey/bin/ffmpeg.exe");
    }
    return [...new Set(candidates)];
}

function warnMissingFfmpeg() {
    if (warnedMissing) {
        return;
    }
    warnedMissing = true;
    console.warn("[thumb] 未找到 ffmpeg，视频缩略图将回退为图标；请安装 ffmpeg 或在 .env 设置 FFMPEG_PATH");
}

type FfmpegResult = {
    buffer?: Buffer;
    /** 这个候选路径根本不存在，可以继续试下一个 */
    missing: boolean;
};

/**
 * 用 ffmpeg 把视频的第 seekSeconds 秒截成一帧 PNG。
 *
 * - 把 -ss 放在 -i 前面是快速 seek，不用解码整段
 * - 先缩到缩略图宽度，避免 4K 视频把整帧 PNG 读进内存
 * - 没有视频轨 / 时长太短 / 解码失败都返回 undefined，由调用方回退到图标
 */
function runFfmpeg(bin: string, input: string, width: number, seekSeconds: number): Promise<FfmpegResult> {
    return new Promise((resolve) => {
        const args = [
            "-hide_banner",
            "-loglevel", "error",
            "-nostdin",
            "-threads", "1"
        ];
        if (seekSeconds > 0) {
            args.push("-ss", String(seekSeconds));
        }
        args.push(
            "-i", input,
            "-frames:v", "1",
            "-an", "-sn", "-dn",
            "-vf", "scale=" + width + ":-2",
            "-f", "image2pipe",
            "-vcodec", "png",
            "pipe:1"
        );

        let child;
        try {
            child = spawn(bin, args, {
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"]
            });
        }
        catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            resolve({ missing: code === "ENOENT" });
            return;
        }

        const chunks: Buffer[] = [];
        let stderr = "";
        let settled = false;
        let timedOut = false;

        const finish = (result: FfmpegResult) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, FRAME_TIMEOUT_MS);

        child.stdout.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        child.stderr.on("data", (chunk: Buffer) => {
            if (stderr.length < MAX_STDERR) {
                stderr += chunk.toString();
            }
        });
        child.on("error", (e: NodeJS.ErrnoException) => {
            if (e.code === "ENOENT") {
                finish({ missing: true });
                return;
            }
            console.warn("[thumb] 启动 ffmpeg 失败:", e.message);
            finish({ missing: false });
        });
        child.on("close", (code) => {
            if (timedOut) {
                console.warn("[thumb] ffmpeg 截图超时:", input);
                finish({ missing: false });
                return;
            }
            if (code !== 0) {
                if (stderr.trim()) {
                    console.warn("[thumb] ffmpeg 截图失败:", input, stderr.trim());
                }
                finish({ missing: false });
                return;
            }
            finish({ buffer: chunks.length ? Buffer.concat(chunks) : undefined, missing: false });
        });
    });
}

async function runWithCandidates(input: string, width: number, seekSeconds: number): Promise<Buffer | undefined> {
    if (ffmpegUnavailable) {
        return undefined;
    }
    let missing = false;
    for (const bin of ffmpegCandidates()) {
        const result = await runFfmpeg(bin, input, width, seekSeconds);
        if (result.buffer) {
            return result.buffer;
        }
        if (!result.missing) {
            // ffmpeg 确实跑起来了，只是这个视频截不出帧；换时间点或回退图标，不用再试别的路径
            return undefined;
        }
        missing = true;
    }
    if (missing) {
        ffmpegUnavailable = true;
        warnMissingFfmpeg();
    }
    return undefined;
}

async function extractFrame(input: string, width: number): Promise<Buffer | undefined> {
    // 1 秒处通常已经过了黑场/台标；短视频截不到时再回退到第 0 帧
    return (await runWithCandidates(input, width, 1)) ?? (await runWithCandidates(input, width, 0));
}

/** 独立视频文件：直接交给 ffmpeg，不复制 */
export function videoFrameFromFile(file: string, width: number) {
    return extractFrame(file, width);
}

/** 压缩包里的视频：node-stream-zip 只能给 Buffer，先落一个临时文件，截完立刻删 */
export async function videoFrameFromBuffer(buffer: Buffer, ext: string, width: number): Promise<Buffer | undefined> {
    const safeExt = ext.toLowerCase() === "webm" ? "webm" : "mp4";
    const tmp = path.join(os.tmpdir(), "view-comic-video-" + randomUUID() + "." + safeExt);
    await fsp.writeFile(tmp, buffer);
    try {
        return await extractFrame(tmp, width);
    }
    finally {
        await fsp.unlink(tmp).catch(() => undefined);
    }
}
