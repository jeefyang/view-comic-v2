<template>
    <n-flex vertical style="gap: 10px">
        <XBlockButton class="btn">清除缩略图缓存</XBlockButton>
        <XBlockButton class="btn">清除历史记录</XBlockButton>
        <XBlockButton class="btn">清除书签记录</XBlockButton>
        <XBlockButton class="btn" @click="handleClearCache">清除当前客户端缓存</XBlockButton>
    </n-flex>
</template>

<script lang="ts" setup>
import { useDialog } from "naive-ui";
import XBlockButton from "@/components/XBlockButton.vue";
import { useConfigStore } from "@/stores/config";

const dialog = useDialog();
const configStore = useConfigStore();

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
.btn {
    font-size: large;
}
</style>
