// src/router/index.ts
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import LibraryView from '@/views/LibraryView.vue'
import ComicsListView from '@/views/ComicsListView.vue'
import SettingsView from '@/views/SettingsView.vue'
import ReaderView from '@/views/ReaderView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/library' },
  {
    path: '/library',
    component: LibraryView,
    meta: { showBottomNav: true, title: '书库' }
  },
  {
    path: '/comics/:libraryId',
    component: ComicsListView,
    props: true,
    meta: { showBottomNav: true, title: '漫画列表' }
  },
  {
    path: '/settings',
    component: SettingsView,
    meta: { showBottomNav: true, title: '设置' }
  },
  {
    path: '/reader/:comicId',
    component: ReaderView,
    props: true,
    meta: { showBottomNav: false, title: '阅读中' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router