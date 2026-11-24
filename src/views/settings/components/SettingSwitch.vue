<template>
    <div class="st-row" :class="{ 'is-disabled': disabled }">
        <div class="st-row-main">
            <span :id="labelId" class="st-row-title">{{ label }}</span>
            <p v-if="description" class="st-row-desc">{{ description }}</p>
        </div>
        <button
            class="st-switch"
            type="button"
            role="switch"
            :aria-checked="modelValue"
            :aria-labelledby="labelId"
            :disabled="disabled"
            @click="toggle"
        >
            <span class="st-switch-track" aria-hidden="true"></span>
        </button>
    </div>
</template>

<script lang="ts" setup>
import { useId } from "vue";

const props = withDefaults(
    defineProps<{
        modelValue?: boolean;
        label: string;
        description?: string;
        disabled?: boolean;
    }>(),
    { modelValue: false, description: "", disabled: false }
);

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const labelId = `st-sw-${useId()}`;

const toggle = () => {
    if (props.disabled) {
        return;
    }
    emit("update:modelValue", !props.modelValue);
};
</script>
