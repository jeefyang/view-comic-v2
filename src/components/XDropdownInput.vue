<template>
    <n-dropdown
        trigger="manual"
        :options="props.options"
        @select="handleSelectPathOption"
        :show="show"
        @clickoutside="show = false"
        style="max-width: 90vw; max-height: 25vh; overflow: auto"
        :style="props.extraStyle"
    >
        <n-input v-model:value="modelValue" :placeholder="placeholder" @input="(e) => onChange(e)" @click="onChange(modelValue)" />
    </n-dropdown>
</template>
<script lang="ts" setup>
import type { DropdownMixedOption } from "naive-ui/es/dropdown/src/interface";
import { computed, ref, type CSSProperties } from "vue";

const props = defineProps({
    value: {
        type: String,
        default: ""
    },
    placeholder: {
        type: String,
        default: "请输入"
    },
    options: {
        default: [] as DropdownMixedOption[]
    },
    extraStyle: {
        default: {} as CSSProperties
    }
});

const emits = defineEmits(["update:value", "change", "update:show"]);

const show = ref(false);

const modelValue = computed({
    get() {
        return props.value;
    },
    set(val) {
        emits("update:value", val);
    }
});

const handleSelectPathOption = (option: string) => {
    modelValue.value = option;
    emits("change", option);
};

const onChange = (e: string) => {
    show.value = true;
    emits("change", e);
};
</script>
