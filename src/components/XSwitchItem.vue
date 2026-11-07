<template>
    <n-el class="x-switch-item" :class="{ 'is-disabled': disabled }" @click="toggle">
        <div class="x-switch-item__main">
            <div class="x-switch-item__label">{{ label }}</div>
            <div class="x-switch-item__desc" v-if="description">{{ description }}</div>
        </div>
        <n-switch :value="modelValue" :disabled="disabled" size="small" @update:value="onUpdate" @click.stop></n-switch>
    </n-el>
</template>

<script setup lang="ts">
/**
 * 一行式开关：左侧标题 + 说明，右侧 n-switch。
 * 整行可点击（移动端友好），点击 switch 本身不会触发两次切换。
 */
const props = withDefaults(defineProps<{
    modelValue?: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
}>(), {
    modelValue: false,
    description: "",
    disabled: false
});

const emits = defineEmits<{
    "update:modelValue": [value: boolean];
}>();

const onUpdate = (value: boolean) => {
    emits("update:modelValue", value);
};

const toggle = () => {
    if (props.disabled) {
        return;
    }
    emits("update:modelValue", !props.modelValue);
};
</script>

<style lang="scss" scoped>
.x-switch-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--border-radius);
    cursor: pointer;
    user-select: none;
    transition: background-color 0.3s ease;

    &:hover {
        background-color: var(--divider-color);
    }

    &__main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    &__label {
        font-size: large;
    }

    &__desc {
        font-size: 12px;
        line-height: 1.4;
        opacity: 0.6;
    }

    &.is-disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
}
</style>
