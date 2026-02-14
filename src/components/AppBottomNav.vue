<!-- src/components/AppBottomNav.vue -->
<template>
  <n-layout-footer bordered position="absolute" style="height: 60px; padding: 0; display: flex">
    <div v-for="item in navItems" :key="item.path" class="nav-item" :class="{ active: isActive(item.path) }">
      <div class="flex flex-col items-center gap-1 p-2" @click="$router.push(item.path)"
        :style="{ color: isActive(item.path) ? themeVars.primaryColor : undefined }">
        <n-icon :size="20" :component="item.icon" />
        <span>{{ item.label }}</span>
      </div>

    </div>
  </n-layout-footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { BookOutline, SettingsOutline, LibraryOutline } from '@vicons/ionicons5'
import { useThemeVars } from "naive-ui"

const route = useRoute()
const themeVars = useThemeVars()

const navItems = [
  { label: '书库', path: '/library', icon: LibraryOutline },
  { label: '列表', path: '/list', icon: BookOutline },
  { label: '设置', path: '/settings', icon: SettingsOutline }
]

// 精确匹配当前路由（支持子路径）
const isActive = (path: string): boolean => {
  return route.path === path
}
</script>

<style scoped>
.nav-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-color-base);
  transition: color 0.2s;
}

.nav-item.active {
  color: var(--primary-color);
}

/* 取消 n-button 的干扰（改用 div） */
</style>