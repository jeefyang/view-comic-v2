<!-- src/App.vue -->
<template>
    <n-config-provider :theme="darkTheme ? darkThemePreset : undefined">
        <n-global-style />
        <n-dialog-provider>
            <n-message-provider>
                <div id="main" v-if="configStore.isInit">
                    <!-- 所有页面都缓存 -->

                    <router-view v-slot="{ Component }">
                        <keep-alive :include="cachedViews">
                            <component :is="Component" />
                        </keep-alive>
                    </router-view>

                    <!-- 底部导航（仅在需要时显示） -->
                    <AppBottomNav v-if="$route.meta.showBottomNav" />
                </div>
                <XLogin v-model:show="configStore.showLogin"</XLogin>
            </n-message-provider>
        </n-dialog-provider>
    </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useDark } from "@vueuse/core";
import { darkTheme, darkTheme as darkThemePreset } from "naive-ui";
import AppBottomNav from "@/components/AppBottomNav.vue";
import { useConfigStore } from "./stores/config";
import XLogin from "./components/XLogin.vue";
import router from "@/router";
import { configFetch, libraryFetch, userFetch, viewFetch } from "./utils/jFetch";
import type { ResSendType } from "@common/apis/tools/apiUrlsTrans";

const configStore = useConfigStore();

/**
 * 401 只弹一次登录框：
 * reader 一屏可能并发几十个 /api/file 请求，全部 401 时会把弹窗反复顶开，
 * 这个标志保证同一轮失效只提示一次，登录成功后自动复位。
 */
let loginPrompted = false;

// 响应式暗色主题（可选）
const isDark = useDark();

// 所有需要缓存的页面 name（必须与组件 name 一致！）
const cachedViews = [
    "libraryView",
    "shelfView",
    "historyView",
    "settingsView",
    "readerView" // ← 阅读页也缓存！
];

onMounted(async () => {
[userFetch, configFetch, libraryFetch,viewFetch].forEach(item => {
    item.getHeaderFn = async () => {
        const headers = new Headers({
            "Content-Type": "application/json",
            "token": configStore.token || "",

        });
        return headers;
    };

    item.addListener("afterFetch", async (key: string, res: ResSendType<any> | undefined) => {
        if (res?.code == 401) {
            console.warn("请登录");
            configStore.token = "";
            configStore.save();
            if (!loginPrompted) {
                loginPrompted = true;
                configStore.showLogin = true;
            }
            // 登录失效后数据页没有任何可展示内容，统一回首页兜底
            if (router.currentRoute.value.path !== "/library") {
                router.replace({ path: "/library" });
            }
        }
        return;
    });
});
// 重新登录成功后复位，下次再失效还能提示一次
watch(() => configStore.token, (token) => {
    if (token) {
        loginPrompted = false;
    }
});
await configStore.initConfig()
configStore.isInit = true;
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
