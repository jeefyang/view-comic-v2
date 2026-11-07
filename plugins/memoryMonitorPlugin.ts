import { Plugin } from 'vite';

export function memoryMonitorPlugin(): Plugin {
    let timer: NodeJS.Timeout | null = null;
    return {
        name: 'vite-plugin-memory-monitor',
        // 插件生效阶段：仅在 serve (开发) 模式
        apply: 'serve',
        // 钩子：配置解析完成后执行
        configResolved(config) {
            if (config.command === 'serve') {
                const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
                console.log('🟢 内存监控插件已启动');
                timer = setInterval(() => {
                    const mem = process.memoryUsage();
                    const rss = formatMB(mem.rss);
                    const heap = formatMB(mem.heapUsed);
                    console.log(`[内存监控] RSS: ${rss} MB | Heap: ${heap} MB`);
                }, 3000);
            }
        },
        // 钩子：服务关闭时清理
        closeBundle() {
            if (timer) clearInterval(timer);
        }
    };
}
