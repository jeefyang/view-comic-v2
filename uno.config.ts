// uno.config.ts（可选，但推荐）
import { defineConfig, presetUno, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),      // 基础原子类（flex, p-4, text-center...）
    presetIcons({     // 图标支持（可选）
      scale: 1.2,
      warn: true,
    })
  ]
})