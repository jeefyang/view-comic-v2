import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';

import AutoImport from 'unplugin-auto-import/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';

import UnoCSS from 'unocss/vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        vueJsx(),
        UnoCSS(),
        AutoImport({
            imports: [
                'vue',
                {
                    'naive-ui': [
                        'useDialog',
                        'useMessage',
                        'useNotification',
                        'useLoadingBar'
                    ]
                }
            ]
        }),
        Components({
            resolvers: [NaiveUiResolver()]
        })
    ],

    resolve: {
        alias: {
            "@common":fileURLToPath(new URL('./common', import.meta.url)),
            '@': fileURLToPath(new URL('./src', import.meta.url))
        },
    },

    // 开发服务器由 server/dev.mjs 启动（页面与 /api 同一个端口，端口读 .env 的 PORT）
});
