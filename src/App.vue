<!-- src/App.vue -->
<template>
    <n-config-provider :theme="darkTheme ? darkThemePreset : undefined">
        <n-global-style />
        <n-dialog-provider>
            <n-message-provider>
                <div id="main">
                    <!-- 所有页面都缓存 -->

                    <router-view v-slot="{ Component }">
                        <keep-alive :include="cachedViews">
                            <component :is="Component" />
                        </keep-alive>
                    </router-view>

                    <!-- 底部导航（仅在需要时显示） -->
                    <AppBottomNav v-if="$route.meta.showBottomNav" />
                </div>
                <XLogin v-model:show="config.showLogin"</XLogin>
            </n-message-provider>
        </n-dialog-provider>
    </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useDark } from "@vueuse/core";
import { darkTheme, darkTheme as darkThemePreset } from "naive-ui";
import AppBottomNav from "@/components/AppBottomNav.vue";
import { useConfigStore } from "./stores/config";
import XLogin from "./components/XLogin.vue";
import { configFetch, libraryFetch, userFetch, viewFetch } from "./utils/jFetch";
import type { ResSendType } from "@common/apis/tools/apiUrlsTrans";

const config = useConfigStore();

// 响应式暗色主题（可选）
const isDark = useDark();

// 所有需要缓存的页面 name（必须与组件 name 一致！）
const cachedViews = [
    "libraryView",
    "shelfView",
    "settingsView",
    "readerView" // ← 阅读页也缓存！
];

onMounted(() => {
[userFetch, configFetch, libraryFetch,viewFetch].forEach(item => {
    item.getHeaderFn = async () => {
        const headers = new Headers({
            "Content-Type": "application/json",
            "token": config.token || "",

        });
        return headers;
    };

    item.addListener("afterFetch", async (key: string, res: ResSendType<any> | undefined) => {
        if (res?.code == 401) {
            console.warn("请登录");
            const configStore = useConfigStore();
            configStore.token = "";
            configStore.save();
            configStore.showLogin = true;
        }
        return;
    });
});
});
</script>

<style>
#main {
    height: calc(100vh - 60px - 2rem);
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
</style>
