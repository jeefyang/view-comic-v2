// src/router/index.ts
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import LibraryView from '@/views/library/libraryView.vue';
import { useConfigStore } from '@/stores/config';

// 首屏只加载书库页；其余页面按路由懒加载，避免阅读器/瀑布流/书架虚拟列表
// 全部挤进入口包。Vite 会自动为这些动态 import 生成独立 chunk。
const ShelfView = () => import("@/views/shelf/shelfView.vue");
const SettingsView = () => import('@/views/settings/settingsView.vue');
const HistoryView = () => import('@/views/history/historyView.vue');
const ReaderView = () => import('@/views/reader/readerView.vue');

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
        path: '/history',
        name: "historyView",
        component: HistoryView,
        meta: { showBottomNav: true, title: '历史' }
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