<template>
    <div
        class="st-row st-row--slider"
        @mouseenter="emitEdge(edge)"
        @mouseleave="emitEdge(null)"
        @focusin="emitEdge(edge)"
        @focusout="emitEdge(null)"
    >
        <label class="st-row-title st-range-label" :for="inputId">{{ label }}</label>
        <input
            :id="inputId"
            class="st-range"
            type="range"
            :min="min"
            :max="max"
            :step="step"
            :value="modelValue"
            :style="{ '--st-fill': fillPercent }"
            @input="onInput"
        />
        <output class="st-range-value" :for="inputId">
            {{ modelValue }}<span>{{ unit }}</span>
        </output>
    </div>
</template>

<script lang="ts" setup>
import { computed, useId } from "vue";
import type { PlateEdge } from "./plateTypes";

const props = withDefaults(
    defineProps<{
        modelValue: number;
        label: string;
        min?: number;
        max?: number;
        step?: number;
        unit?: string;
        edge?: PlateEdge;
    }>(),
    { min: 0, max: 48, step: 1, unit: "px", edge: null }
);

const emit = defineEmits<{
    "update:modelValue": [value: number];
    edge: [edge: PlateEdge];
}>();

const inputId = `st-range-${useId()}`;

const fillPercent = computed(() => {
    const span = props.max - props.min;
    if (span <= 0) {
        return "0%";
    }
    const percent = ((props.modelValue - props.min) / span) * 100;
    return `${Math.min(100, Math.max(0, percent))}%`;
});

const onInput = (event: Event) => {
    emit("update:modelValue", Number((event.target as HTMLInputElement).value));
};

const emitEdge = (edge: PlateEdge) => {
    emit("edge", edge);
};
</script>
