<!-- src/App.vue -->
<template>
  <n-config-provider :theme="darkTheme ? darkThemePreset : undefined">
    <n-global-style />
    <div id="app">
      <!-- 所有页面都缓存 -->
      <keep-alive :include="cachedViews">
        <router-view />
      </keep-alive>

      <!-- 底部导航（仅在需要时显示） -->
      <AppBottomNav v-if="$route.meta.showBottomNav" />
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDark } from '@vueuse/core'
import { darkTheme, darkTheme as darkThemePreset } from 'naive-ui'
import AppBottomNav from '@/components/AppBottomNav.vue'

// 响应式暗色主题（可选）
const isDark = useDark()

// 所有需要缓存的页面 name（必须与组件 name 一致！）
const cachedViews = [
  'LibraryView',
  'ComicsListView',
  'SettingsView',
  'ReaderView' // ← 阅读页也缓存！
]
</script>

<style>
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>