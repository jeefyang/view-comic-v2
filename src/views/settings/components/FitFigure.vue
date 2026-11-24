<template>
    <svg class="st-fit-figure" viewBox="0 0 56 42" fill="none" aria-hidden="true">
        <rect x="0.5" y="0.5" width="55" height="41" stroke="currentColor" stroke-opacity="0.45" />
        <template v-if="mode === 'fit'">
            <rect x="12" y="9" width="32" height="24" fill="currentColor" fill-opacity="0.22" stroke="currentColor" />
        </template>
        <template v-else-if="mode === 'width'">
            <rect x="1.5" y="9" width="53" height="24" fill="currentColor" fill-opacity="0.22" stroke="currentColor" />
            <path d="M12 4h32M12 4l4-2M12 4l4 2M44 4l-4-2M44 4l-4 2" stroke="currentColor" stroke-linecap="round" />
            <path d="M12 38h32M12 38l4-2M12 38l4 2M44 38l-4-2M44 38l-4 2" stroke="currentColor" stroke-linecap="round" />
        </template>
        <template v-else-if="mode === 'height'">
            <rect x="14" y="1.5" width="28" height="39" fill="currentColor" fill-opacity="0.22" stroke="currentColor" />
            <path d="M4 10v22M4 10l-2 4M4 10l2 4M4 32l-2-4M4 32l2-4" stroke="currentColor" stroke-linecap="round" />
            <path d="M52 10v22M52 10l-2 4M52 10l2 4M52 32l-2-4M52 32l2-4" stroke="currentColor" stroke-linecap="round" />
        </template>
        <template v-else>
            <rect x="20" y="7" width="24" height="28" fill="currentColor" fill-opacity="0.22" stroke="currentColor" transform="rotate(90 28 21)" />
            <path d="M42 10a13 13 0 0 1-1 17" stroke="currentColor" stroke-linecap="round" stroke-dasharray="2 3" />
            <path d="M41 27l-2.6-1.4M41 27l-1.6 2.6" stroke="currentColor" stroke-linecap="round" />
        </template>
    </svg>
</template>

<script lang="ts" setup>
import type { FitModeType } from "@/views/reader/readerSettings";

defineProps<{ mode: FitModeType }>();
</script>
