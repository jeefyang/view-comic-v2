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
                <XLogin v-model:show="configStore.showLogin"</XLogin>
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
import { addJFetchCB, jFetch } from "./utils/jFetch";
import XLogin from "./components/XLogin.vue";

const configStore = useConfigStore();

// 响应式暗色主题（可选）
const isDark = useDark();

// 所有需要缓存的页面 name（必须与组件 name 一致！）
const cachedViews = [
    "LibraryView",
    "ComicsListView",
    "SettingsView",
    "ReaderView" // ← 阅读页也缓存！
];

onMounted(() => {
    addJFetchCB(401, (res) => {
        configStore.token=""
        configStore.save()
        configStore.showLogin = true;
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
