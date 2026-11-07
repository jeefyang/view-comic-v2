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
        <div class="section-title ml-3 mb-1">清理</div>
        <XBlockButton class="btn" @click="handleClearThumbs">清除缩略图缓存</XBlockButton>
        <XBlockButton class="btn">清除历史记录</XBlockButton>
        <XBlockButton class="btn">清除书签记录</XBlockButton>
        <XBlockButton class="btn" @click="handleClearCache">清除当前客户端缓存</XBlockButton>
    </n-flex>
</template>

<script lang="ts" setup>
import { useDialog, useMessage } from "naive-ui";
import XBlockButton from "@/components/XBlockButton.vue";
import XSwitchItem from "@/components/XSwitchItem.vue";
import { useConfigStore } from "@/stores/config";
import { appFeatures } from "@/utils/appFeatures";
import { viewFetch } from "@/utils/jFetch";
import { clearThumbCache } from "@/utils/thumbCache";

const dialog = useDialog();
const msg = useMessage();
const configStore = useConfigStore();

const handleClearThumbs = () => {
    dialog.warning({
        title: "提示",
        content: `确定要清除缩略图缓存吗？服务端与本地缓存都会被清空，之后浏览会重新生成。`,
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: async () => {
            const res = await viewFetch.request("clearThumbs");
            await clearThumbCache();
            if (res.code === 200) {
                msg.success(`已清除 ${res.data?.count ?? 0} 张缩略图`);
            }
            else {
                msg.error(res.msg || "清除缩略图失败");
            }
        }
    });
};

const handleClearCache = () => {
    dialog.warning({
        title: "提示",
        content: `确定要清除客户端缓存吗？(将会触发刷新页面)`,
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: () => {
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
</style>
