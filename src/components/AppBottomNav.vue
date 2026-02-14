<!-- src/components/AppBottomNav.vue -->
<template>
  <n-layout-footer
    bordered
    position="absolute"
    style="height: 60px; padding: 0; display: flex"
  >
    <n-button
      v-for="item in navItems"
      :key="item.path"
      text
      size="large"
      :class="{ active: $route.path === item.path }"
      @click="$router.push(item.path)"
      style="flex: 1; flex-direction: column; height: 100%"
    >
      <n-icon :size="20" :component="item.icon" />
      <span>{{ item.label }}</span>
    </n-button>
  </n-layout-footer>
</template>

<script setup lang="ts">
import { BookOutline, SettingsOutline, LibraryOutline } from '@vicons/ionicons5'

const navItems = [
  { label: '书库', path: '/library', icon: LibraryOutline },
  { label: '列表', path: '/comics/local', icon: BookOutline }, // 默认 libraryId 示例
  { label: '设置', path: '/settings', icon: SettingsOutline }
]
</script>

<style scoped>
.n-button.active {
  color: var(--primary-color);
}
.n-button:not(.active) {
  color: var(--text-color-base);
}
</style>