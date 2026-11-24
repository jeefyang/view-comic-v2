<!-- src/components/AppBottomNav.vue -->
<template>
    <nav class="app-nav" aria-label="主导航">
        <button
            v-for="item in navItems"
            :key="item.path"
            class="app-nav-item"
            :class="{ 'is-active': isActive(item.path) }"
            type="button"
            :aria-current="isActive(item.path) ? 'page' : undefined"
            @click="$router.push(item.path)"
        >
            <n-icon :size="20" :component="item.icon" />
            <span class="app-nav-label">{{ item.label }}</span>
        </button>
    </nav>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { BookOutline, SettingsOutline, LibraryOutline, TimeOutline } from "@vicons/ionicons5";

const route = useRoute();

const navItems = [
    { label: "书库", path: "/library", icon: LibraryOutline },
    { label: "书架", path: "/shelf", icon: BookOutline },
    { label: "历史", path: "/history", icon: TimeOutline },
    { label: "设置", path: "/settings", icon: SettingsOutline }
];

const isActive = (path: string): boolean => {
    return route.path === path;
};
</script>

<style scoped>
.app-nav {
    flex: none;
    display: flex;
    height: 60px;
    border-top: 1px solid var(--st-line);
    background: var(--st-ink);
}

.app-nav-item {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--st-graphite);
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: color 0.15s ease;
}

.app-nav-item:hover {
    color: var(--st-paper);
}

.app-nav-item.is-active {
    color: var(--st-vermilion);
}

/* 当前项只多一条顶边，不加胶囊底 */
.app-nav-item.is-active::before {
    content: "";
    position: absolute;
    top: -1px;
    left: 50%;
    width: 28px;
    height: 2px;
    transform: translateX(-50%);
    background: var(--st-vermilion);
}

.app-nav-item:focus-visible {
    outline: 2px solid var(--st-paper);
    outline-offset: -3px;
}

/* 桌面上四项收拢居中，别拉成 1440 宽的一排 */
@media (min-width: 1000px) {
    .app-nav {
        justify-content: center;
    }

    .app-nav-item {
        flex: 0 1 180px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .app-nav-item {
        transition-duration: 0.001ms;
    }
}
</style>
