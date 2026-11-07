// src/router/index.ts
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import LibraryView from '@/views/library/libraryView.vue';
import ShelfView from "@/views/shelf/shelfView.vue";
import SettingsView from '@/views/settings/settingsView.vue';
import ReaderView from '@/views/reader/readerView.vue';
import { useConfigStore } from '@/stores/config';

const routes: RouteRecordRaw[] = [
    { path: '/', redirect: '/library' },
    {
        path: '/library',
        component: LibraryView,
        name: "libraryView",
        meta: { showBottomNav: true, title: '书库' }
    },
    {
        path: '/shelf',
        component: ShelfView,
        name: "shelfView",
        props: true,
        meta: { showBottomNav: true, title: '书架' }
    },
    {
        path: '/settings',
        name: "settingsView",
        component: SettingsView,
        meta: { showBottomNav: true, title: '设置' }
    },
    {
        path: '/reader',
        name: "readerView",
        component: ReaderView,
        props: true,
        meta: { showBottomNav: false, title: '阅读中' }
    },
    // 兜底：未知路径（含 hash 写错）一律回首页
    { path: '/:pathMatch(.*)*', redirect: '/library' }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

// 未登录时只能停留在首页：reader/shelf/settings 统统回首页兜底，
// 避免带着空登录态进数据页出现白屏或连环弹登录框
router.beforeEach((to) => {
    const configStore = useConfigStore();
    if (!configStore.isLogin && to.path !== '/library') {
        return { path: '/library', replace: true };
    }
    return true;
});

export default router;