<template>
    <n-el
        tag="div"
        class="x-option-item"
        :class="{ 'is-selected': selected, 'is-disabled': disabled }"
        role="radio"
        :aria-checked="selected"
        :tabindex="disabled ? -1 : 0"
        @click="onSelect"
        @keydown.enter.prevent="onSelect"
        @keydown.space.prevent="onSelect"
    >
        <div class="x-option-item__body">
            <div class="x-option-item__label">{{ label }}</div>
            <div v-if="description" class="x-option-item__desc">{{ description }}</div>
        </div>
        <n-icon v-if="selected" class="x-option-item__check" :size="18">
            <CheckCircleRound />
        </n-icon>
    </n-el>
</template>

<script lang="ts" setup>
import { CheckCircleRound } from "@vicons/material";

const props = withDefaults(
    defineProps<{
        selected?: boolean;
        label: string;
        description?: string;
        disabled?: boolean;
    }>(),
    { selected: false, description: "", disabled: false }
);

const emit = defineEmits<{ select: [] }>();

const onSelect = () => {
    if (props.disabled) {
        return;
    }
    emit("select");
};
</script>

<style lang="scss" scoped>
.x-option-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    transition: background-color 0.2s ease;

    &:hover {
        background-color: var(--divider-color);
    }

    &.is-selected {
        background-color: var(--divider-color);
        border-color: var(--primary-color);
    }

    &.is-disabled {
        cursor: not-allowed;
        opacity: 0.5;

        &:hover {
            background-color: transparent;
        }
    }

    &__body {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    &__label {
        font-size: 15px;
    }

    &__desc {
        font-size: 12px;
        line-height: 1.4;
        opacity: 0.6;
    }

    &__check {
        color: var(--primary-color);
        flex-shrink: 0;
    }
}
</style>
