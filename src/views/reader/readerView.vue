<!-- src/views/ReaderView.vue -->
<template>
  <div class="reader-container">
    <!-- 漫画阅读器（可横向/纵向滑动） -->
    <div class="pages">
      <img
        v-for="page in pages"
        :key="page.id"
        :src="page.url"
        class="page-image"
        loading="lazy"
      />
    </div>

    <!-- 返回按钮（左上角） -->
    <n-button
      circle
      size="small"
      class="back-btn"
      @click="$router.back()"
    >
      <n-icon :component="ArrowBackOutline" />
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { ArrowBackOutline } from '@vicons/ionicons5'
import { onMounted, ref } from 'vue'

// 模拟漫画页面
const pages = ref([
  { id: 1, url: '/mock/1.jpg' },
  { id: 2, url: '/mock/2.jpg' },
  // ...
])

onMounted(() => {
  // 进入时锁定竖屏 or 横屏（可选）
  document.body.style.overflow = 'hidden'
})
</script>

<style scoped>
.reader-container {
  width: 100vw;
  height: 100vh;
  overflow: auto;
  background: #000;
  position: relative;
}

.pages {
  display: flex;
  flex-direction: column; /* 竖屏阅读 */
  /* 或 flex-direction: row; /* 横屏阅读 */
}

.page-image {
  width: 100%;
  display: block;
}

.back-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 100;
}
</style>