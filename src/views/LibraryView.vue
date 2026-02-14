<template>
  <n-space vertical>
    <n-space>
      <n-button @click="theme = darkTheme">
        深色
      </n-button>
      <n-button @click="theme = null">
        浅色
      </n-button>
    </n-space>
    <n-config-provider :theme="theme">
      <n-card>
        <n-el
          tag="span"
          style="
            color: var(--primary-color);
            transition: 0.3s var(--cubic-bezier-ease-in-out);
          "
        >
          我是个 span 标签qqq233
        </n-el>
      </n-card>
    </n-config-provider>
  </n-space>
</template>

<script setup lang="ts">
import { darkTheme } from 'naive-ui'
import { ref } from 'vue'

const theme = ref<typeof darkTheme | null>(null)
</script>