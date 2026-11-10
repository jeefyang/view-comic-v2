<template>
    <n-flex vertical style="gap: 10px">
        <div class="section-title ml-3 mb-1">缩略图</div>
        <n-flex vertical :size="4">
            <XSwitchItem
                v-model="appFeatures.thumbnails"
                label="显示缩略图"
                description="关闭后书架与文件列表只显示类型图标，不再请求图片（弱网 / 流量紧张时建议关闭）"
            />
        </n-flex>
        <div class="section-title ml-3 mb-1">媒体缓存</div>
        <n-flex vertical :size="8">
            <n-flex align="center" :size="8">
                <span class="media-label">容量上限</span>
                <n-input-number v-model:value="maxMb" :min="128" :max="8192" :step="128" style="width: 120px" />
                <span class="media-unit">MB</span>
            </n-flex>
            <n-flex align="center" :size="8">
                <span class="media-label">条目上限</span>
                <n-input-number v-model:value="maxEntries" :min="100" :max="20000" :step="100" style="width: 120px" />
                <span class="media-unit">条</span>
            </n-flex>
            <div class="media-stats">{{ statsText }}</div>
        </n-flex>
        <div class="section-title ml-3 mb-1">清理</div>
        <XBlockButton class="btn" @click="handleClearThumbs">清除缩略图缓存</XBlockButton>
        <XBlockButton class="btn" @click="handleClearMediaCache">清除媒体缓存</XBlockButton>
        <XBlockButton class="btn">清除历史记录</XBlockButton>
        <XBlockButton class="btn">清除书签记录</XBlockButton>
        <XBlockButton class="btn" @click="handleClearCache">清除当前客户端缓存</XBlockButton>
    </n-flex>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import XBlockButton from "@/components/XBlockButton.vue";
import XSwitchItem from "@/components/XSwitchItem.vue";
import { useConfigStore } from "@/stores/config";
import { appFeatures } from "@/utils/appFeatures";
import {
    clearMediaCache,
    getMediaCacheStats,
    mediaCacheSettings,
    type MediaCacheStats
} from "@/utils/mediaCache";
import { clearThumbCache } from "@/utils/thumbCache";

const dialog = useDialog();
const msg = useMessage();
const configStore = useConfigStore();

const maxMb = ref(Math.round(mediaCacheSettings.maxBytes / 1024 / 1024));
const maxEntries = ref(mediaCacheSettings.maxEntries);
const stats = ref<MediaCacheStats>();

const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }
    const mb = bytes / 1024 / 1024;
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
};

const statsText = computed(() => {
    const current = stats.value;
    if (!current) {
        return "正在读取媒体缓存…";
    }
    return `已用 ${formatBytes(current.bytes)} / 目标 ${formatBytes(current.configuredBytes)}（实际可用 ${formatBytes(current.realCap)}），条目 ${current.count} / ${current.maxEntries}；图片 ${current.imageCount} 条（${formatBytes(current.imageBytes)}），视频 ${current.videoCount} 条（${formatBytes(current.videoBytes)}）`;
});

const loadStats = async () => {
    try {
        stats.value = await getMediaCacheStats();
    } catch {
        // 缓存不可用时保持旧值
    }
};

watch([maxMb, maxEntries], ([mb, entries]) => {
    if (typeof mb === "number" && Number.isFinite(mb) && mb > 0) {
        mediaCacheSettings.maxBytes = Math.round(mb * 1024 * 1024);
    }
    if (typeof entries === "number" && Number.isFinite(entries) && entries > 0) {
        mediaCacheSettings.maxEntries = Math.floor(entries);
    }
    void loadStats();
});

onMounted(() => {
    void loadStats();
});

const handleClearThumbs = () => {
    dialog.warning({
        title: "提示",
        content: `确定要清除缩略图缓存吗？只清除本机浏览器里的缓存，服务端文件不动；之后浏览会重新生成。`,
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: async () => {
            await clearThumbCache();
            msg.success("已清除本地缩略图缓存（服务端文件保留）");
        }
    });
};

const handleClearMediaCache = () => {
    dialog.warning({
        title: "提示",
        content: "确定要清除媒体缓存吗？只清除本机浏览器里缓存过的页图与视频，书库文件不动；之后浏览会重新从服务器读取。",
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: async () => {
            await clearMediaCache();
            await loadStats();
            msg.success("已清除本地媒体缓存");
        }
    });
};

const handleClearCache = () => {
    dialog.warning({
        title: "提示",
        content: `确定要清除客户端缓存吗？(将会触发刷新页面)`,
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: async () => {
            await clearMediaCache();
            configStore.clear();
            dialog.success({
                closable: false,
                maskClosable: false,
                title: "提示",
                content: `清除客户端缓存成功,将强制刷新页面`,
                positiveText: "刷新",
                onPositiveClick: () => {
                    window.location.reload();
                }
            });
        }
    });
};
</script>

<style scoped lang="scss">
.section-title {
    font-size: 14px;
    opacity: 0.6;
    margin-top: 8px;
}

.btn {
    font-size: large;
}

.media-label {
    width: 72px;
    font-size: 14px;
}

.media-unit {
    font-size: 13px;
    opacity: 0.7;
}

.media-stats {
    padding: 0 2px;
    font-size: 13px;
    line-height: 1.6;
    opacity: 0.72;
}
</style>
