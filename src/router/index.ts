// src/router/index.ts
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import LibraryView from '@/views/library/libraryView.vue';
import ComicListView from '@/views/comicList/comicListView.vue';
import SettingsView from '@/views/settings/settingsView.vue';
import ReaderView from '@/views/reader/readerView.vue';

const routes: RouteRecordRaw[] = [
    { path: '/', redirect: '/library' },
    {
        path: '/library',
        component: LibraryView,
        name: "libraryView",
        meta: { showBottomNav: true, title: '书库' }
    },
    {
        path: '/list',
        component: ComicListView,
        name: "ComicListView",
        props: true,
        meta: { showBottomNav: true, title: '漫画列表' }
    },
    {
        path: '/settings',
        name: "settingsView",
        component: SettingsView,
        meta: { showBottomNav: true, title: '设置' }
    },
    {
        path: '/reader/:comicId',
        name: "readerView",
        component: ReaderView,
        props: true,
        meta: { showBottomNav: false, title: '阅读中' }
    }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;