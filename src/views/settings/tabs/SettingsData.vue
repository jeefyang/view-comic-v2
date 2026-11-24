<template>
    <div class="st-scope st-data">
        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">01</span>
                <h2 class="st-panel-title">缩略图</h2>
                <span class="st-panel-value">{{ appFeatures.thumbnails ? "开启" : "关闭" }}</span>
            </header>
            <div class="st-list" style="margin-top: 6px">
                <SettingSwitch
                    v-model="appFeatures.thumbnails"
                    label="显示缩略图"
                    description="关闭后书架与文件列表只显示类型图标，不再请求图片；弱网或流量紧张时建议关闭"
                />
            </div>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">02</span>
                <h2 class="st-panel-title">媒体缓存</h2>
                <span class="st-panel-value">IndexedDB</span>
            </header>
            <p class="st-panel-note">阅读页加载过的页图与视频会留在本机，再次打开直接从磁盘读，不再走网络。</p>

            <div v-if="!stats && !statsError" class="st-cache-loading" aria-live="polite">
                <span class="st-sr-only">正在读取缓存统计</span>
                <span class="st-skeleton" style="width: 100%"></span>
                <span class="st-skeleton" style="width: 62%"></span>
            </div>

            <div v-else-if="statsError" class="st-error">
                {{ statsError }}
                <button class="st-btn st-btn--ghost" type="button" @click="loadStats">重试</button>
            </div>

            <template v-else-if="stats">
                <div class="st-meter" role="img" :aria-label="meterSummary">
                    <span class="st-meter-fill st-meter-fill--image" :style="{ width: `${imagePercent}%` }"></span>
                    <span class="st-meter-fill st-meter-fill--video" :style="{ width: `${videoPercent}%` }"></span>
                </div>
                <div class="st-meter-legend">
                    <span class="st-legend-key">
                        <span class="st-legend-swatch st-legend-swatch--image" aria-hidden="true"></span>
                        图片 {{ formatBytes(stats.imageBytes) }} · {{ stats.imageCount }} 条
                    </span>
                    <span class="st-legend-key">
                        <span class="st-legend-swatch st-legend-swatch--video" aria-hidden="true"></span>
                        视频 {{ formatBytes(stats.videoBytes) }} · {{ stats.videoCount }} 条
                    </span>
                </div>
                <p class="st-stats">
                    已用 <b>{{ formatBytes(stats.bytes) }}</b> / 目标 <b>{{ formatBytes(stats.configuredBytes) }}</b>（实际可用 {{ formatBytes(stats.realCap) }}）<br />
                    条目 <b>{{ stats.count }}</b> / {{ stats.maxEntries }}
                </p>
            </template>

            <div class="st-list" style="margin-top: 14px">
                <div class="st-row">
                    <div class="st-row-main">
                        <label class="st-row-title" for="cache-max-mb">容量上限</label>
                        <p class="st-row-desc">填大一点能留住更多页，但不要超过浏览器给你的磁盘配额</p>
                    </div>
                    <div class="st-num-wrap">
                        <input
                            id="cache-max-mb"
                            class="st-num"
                            type="number"
                            inputmode="numeric"
                            min="128"
                            step="128"
                            :value="maxMb"
                            @change="applyMaxMb"
                        />
                        <span class="st-unit">MB</span>
                    </div>
                </div>
                <div class="st-row">
                    <div class="st-row-main">
                        <label class="st-row-title" for="cache-max-entries">条目上限</label>
                        <p class="st-row-desc">图片与视频合计的条数；超出后按最久未用的顺序淘汰</p>
                    </div>
                    <div class="st-num-wrap">
                        <input
                            id="cache-max-entries"
                            class="st-num"
                            type="number"
                            inputmode="numeric"
                            min="100"
                            step="100"
                            :value="maxEntries"
                            @change="applyMaxEntries"
                        />
                        <span class="st-unit">条</span>
                    </div>
                </div>
            </div>
        </section>

        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">03</span>
                <h2 class="st-panel-title">清理</h2>
            </header>
            <p class="st-panel-note">本机缓存清掉后，下次打开会重新从服务器生成；历史与书签在云端，清了就所有设备一起没有。</p>
            <div class="st-list">
                <button class="st-action" type="button" @click="handleClearThumbs">
                    <span class="st-action-main">
                        <span class="st-action-title">清除缩略图缓存</span>
                        <span class="st-action-desc">只清本机缩略图，服务端文件保留，之后会按需重新生成</span>
                    </span>
                    <ClearArrow />
                </button>
                <button class="st-action" type="button" @click="handleClearMediaCache">
                    <span class="st-action-main">
                        <span class="st-action-title">清除媒体缓存</span>
                        <span class="st-action-desc">清掉本机缓存过的页图与视频，书库文件不动</span>
                    </span>
                    <ClearArrow />
                </button>
                <button class="st-action st-action--danger" type="button" @click="handleClearHistory">
                    <span class="st-action-main">
                        <span class="st-action-title">清除历史记录</span>
                        <span class="st-action-desc">云端阅读历史，所有登录设备同步清空</span>
                    </span>
                    <ClearArrow />
                </button>
                <button class="st-action st-action--danger" type="button" @click="handleClearBookmarks">
                    <span class="st-action-main">
                        <span class="st-action-title">清除书签记录</span>
                        <span class="st-action-desc">云端书签，所有登录设备同步清空</span>
                    </span>
                    <ClearArrow />
                </button>
                <button class="st-action st-action--danger" type="button" @click="handleClearCache">
                    <span class="st-action-main">
                        <span class="st-action-title">清除当前客户端缓存</span>
                        <span class="st-action-desc">媒体缓存与本机登录态一起清掉，随后强制刷新页面</span>
                    </span>
                    <ClearArrow />
                </button>
            </div>
        </section>
    </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import { useDialog, useMessage } from "naive-ui";
import SettingSwitch from "@/views/settings/components/SettingSwitch.vue";
import ClearArrow from "@/views/settings/components/ClearArrow.vue";
import { useConfigStore } from "@/stores/config";
import { appFeatures } from "@/utils/appFeatures";
import {
    clearMediaCache,
    getMediaCacheStats,
    mediaCacheSettings,
    type MediaCacheStats
} from "@/utils/mediaCache";
import { clearThumbCache } from "@/utils/thumbCache";
import {
    clearBookmarks,
    clearHistory,
    flushHistory,
    historyError,
    loadHistory
} from "@/views/history/historyData";

const dialog = useDialog();
const msg = useMessage();
const configStore = useConfigStore();

const maxMb = ref(Math.round(mediaCacheSettings.maxBytes / 1024 / 1024));
const maxEntries = ref(mediaCacheSettings.maxEntries);
const stats = ref<MediaCacheStats>();
const statsError = ref("");

const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }
    const mb = bytes / 1024 / 1024;
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
};

const percentOf = (value: number, total: number) => {
    if (!total) {
        return 0;
    }
    return Math.min(100, Math.max(0, (value / total) * 100));
};

const imagePercent = computed(() => percentOf(stats.value?.imageBytes ?? 0, stats.value?.realCap ?? 0));
const videoPercent = computed(() => percentOf(stats.value?.videoBytes ?? 0, stats.value?.realCap ?? 0));

const meterSummary = computed(() => {
    const current = stats.value;
    if (!current) {
        return "缓存用量";
    }
    return `图片 ${formatBytes(current.imageBytes)}，视频 ${formatBytes(current.videoBytes)}，实际可用 ${formatBytes(current.realCap)}`;
});

const loadStats = async () => {
    statsError.value = "";
    try {
        stats.value = await getMediaCacheStats();
    }
    catch {
        statsError.value = "读不到本机缓存统计，可能是浏览器禁用了 IndexedDB。";
    }
};

const applyMaxMb = (event: Event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value <= 0) {
        (event.target as HTMLInputElement).value = String(maxMb.value);
        return;
    }
    maxMb.value = Math.round(value);
    mediaCacheSettings.maxBytes = Math.round(maxMb.value * 1024 * 1024);
    void loadStats();
};

const applyMaxEntries = (event: Event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value <= 0) {
        (event.target as HTMLInputElement).value = String(maxEntries.value);
        return;
    }
    maxEntries.value = Math.floor(value);
    mediaCacheSettings.maxEntries = maxEntries.value;
    void loadStats();
};

onMounted(() => {
    void loadStats();
});

const handleClearThumbs = () => {
    dialog.warning({
        title: "清除缩略图缓存",
        content: "只清本机浏览器里的缩略图，服务端文件不动；之后浏览会重新生成。",
        positiveText: "清除",
        negativeText: "取消",
        onPositiveClick: async () => {
            await clearThumbCache();
            msg.success("已清除本机缩略图缓存");
        }
    });
};

const handleClearMediaCache = () => {
    dialog.warning({
        title: "清除媒体缓存",
        content: "只清本机缓存过的页图与视频，书库文件不动；之后浏览会重新从服务器读取。",
        positiveText: "清除",
        negativeText: "取消",
        onPositiveClick: async () => {
            await clearMediaCache();
            await loadStats();
            msg.success("已清除本机媒体缓存");
        }
    });
};

const handleClearHistory = () => {
    dialog.warning({
        title: "清除历史记录",
        content: "会清空云端阅读历史，所有登录设备都同步删除，无法恢复。",
        positiveText: "清除历史",
        negativeText: "取消",
        onPositiveClick: async () => {
            await loadHistory(true);
            clearHistory();
            await flushHistory();
            if (historyError.value) {
                msg.error(historyError.value);
                return;
            }
            msg.success("已清空阅读历史");
        }
    });
};

const handleClearBookmarks = () => {
    dialog.warning({
        title: "清除书签记录",
        content: "会清空云端书签，所有登录设备都同步删除，无法恢复。",
        positiveText: "清除书签",
        negativeText: "取消",
        onPositiveClick: async () => {
            await loadHistory(true);
            clearBookmarks();
            await flushHistory();
            if (historyError.value) {
                msg.error(historyError.value);
                return;
            }
            msg.success("已清空书签");
        }
    });
};

const handleClearCache = () => {
    dialog.warning({
        title: "清除当前客户端缓存",
        content: "媒体缓存与本机登录态会一起清掉，随后强制刷新页面。云端数据不受影响。",
        positiveText: "清除并刷新",
        negativeText: "取消",
        onPositiveClick: async () => {
            await clearMediaCache();
            configStore.clear();
            dialog.success({
                closable: false,
                maskClosable: false,
                title: "缓存已清除",
                content: "马上刷新页面，用新状态重新加载。",
                positiveText: "刷新",
                onPositiveClick: () => {
                    window.location.reload();
                }
            });
        }
    });
};
</script>
