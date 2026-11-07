<template>
    <div class="thumb-image">
        <img v-if="url" class="thumb-image__img" :src="url" :alt="alt" draggable="false" @error="onImgError" />
        <!-- 没有缩略图（视频 / 空包 / 无图目录）时由调用方给默认图标 -->
        <slot v-else></slot>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { appFeatures } from "@/utils/appFeatures";
import { getThumbBlob, putThumbBlob, thumbCacheKey } from "@/utils/thumbCache";

const props = withDefaults(defineProps<{
    editUuid: string;
    /** 相对书库根的路径，例如 img.zip 或 img/img-001.jpg */
    path: string;
    /** 缩略图宽度，服务端只认 160 / 240 */
    width?: number;
    alt?: string;
}>(), {
    width: 160,
    alt: ""
});

const url = ref("");
const failed = ref(false);

// 请求失败（比如确实是视频、空包）的 key 记一份，本页生命周期内不再重复请求
const failedKeys = new Set<string>();

// 全局并发上限：滚动时可能同时冒出十几行，限制住不要一起打服务端
const MAX_CONCURRENT = 4;
let running = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
    if (running < MAX_CONCURRENT) {
        running++;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        waiting.push(() => {
            running++;
            resolve();
        });
    });
}

function release() {
    running--;
    const next = waiting.shift();
    next?.();
}

function encodePath(path: string) {
    return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function setUrl(blob: Blob) {
    if (url.value) {
        URL.revokeObjectURL(url.value);
    }
    url.value = URL.createObjectURL(blob);
}

const onImgError = () => {
    failed.value = true;
};

let seq = 0;
let retryTimer: number | undefined;
const retryCount = new Map<string, number>();
const MAX_RETRY = 3;

async function load() {
    const current = ++seq;
    failed.value = false;
    url.value = "";
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
    }
    // 开关关掉时不发任何请求，直接让调用方用默认图标
    if (!appFeatures.thumbnails) {
        failed.value = true;
        return;
    }
    if (!props.editUuid || !props.path) {
        failed.value = true;
        return;
    }

    const key = thumbCacheKey(props.editUuid, props.width, props.path);
    const cached = await getThumbBlob(key);
    if (current !== seq) {
        return;
    }
    if (cached) {
        setUrl(cached);
        return;
    }
    if (failedKeys.has(key)) {
        failed.value = true;
        return;
    }

    const request = `api/Thumbnail/${props.editUuid}/${props.width}/${encodePath(props.path)}`;
    await acquire();
    const mine = current === seq;
    try {
        if (!mine) {
            return;
        }
        const response = await fetch(request);
        if (current !== seq) {
            return;
        }
        if (response.status === 503) {
            // 服务端生成队列满了：这不是「没有缩略图」，退避后重试几次
            const times = retryCount.get(key) ?? 0;
            if (times >= MAX_RETRY) {
                failedKeys.add(key);
                failed.value = true;
                return;
            }
            retryCount.set(key, times + 1);
            const after = Number(response.headers.get("Retry-After")) || 3;
            const delay = Math.min(Math.max(after, 1), 10) * 1000;
            failed.value = true;
            retryTimer = window.setTimeout(() => {
                if (current === seq) {
                    void load();
                }
            }, delay);
            return;
        }
        if (!response.ok) {
            failedKeys.add(key);
            failed.value = true;
            console.warn("[thumb] 缩略图请求失败", response.status, request);
            return;
        }
        const blob = await response.blob();
        if (current !== seq) {
            return;
        }
        retryCount.delete(key);
        setUrl(blob);
        void putThumbBlob(key, blob);
    }
    catch {
        if (current === seq) {
            failed.value = true;
        }
    }
    finally {
        release();
    }
}

watch(
    () => [props.editUuid, props.path, props.width, appFeatures.thumbnails] as const,
    () => {
        void load();
    },
    { immediate: true }
);

onBeforeUnmount(() => {
    seq++;
    if (url.value) {
        URL.revokeObjectURL(url.value);
        url.value = "";
    }
});

defineExpose({ failed });
</script>

<style scoped>
.thumb-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}

.thumb-image__img {
    width: 100%;
    height: 100%;
    /* 整图放进方框，宁可上下/左右留黑边也不裁切 */
    object-fit: contain;
    border-radius: 4px;
}
</style>
