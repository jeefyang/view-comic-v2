<!-- 页码跳转弹窗：输入页码后跳转 -->
<template>
    <n-modal v-model:show="modelShow" :mask-closable="true">
        <n-card class="page-jump" title="跳转到" :bordered="false" role="dialog" aria-modal="true" style="width: 280px">
            <n-input-number
                ref="inputRef"
                v-model:value="page"
                class="page-jump__input"
                :min="1"
                :max="total"
                :show-button="false"
                :precision="0"
                :input-props="{ inputmode: 'numeric' }"
                placeholder="输入页码"
                @keyup.enter="confirm"
            />
            <div class="page-jump__hint">共 {{ total }} 页</div>
            <template #footer>
                <n-flex justify="end" :size="8">
                    <n-button size="small" @click="modelShow = false">取消</n-button>
                    <n-button size="small" type="primary" @click="confirm">跳转</n-button>
                </n-flex>
            </template>
        </n-card>
    </n-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

const props = withDefaults(
    defineProps<{
        show: boolean;
        /** 当前页（0 基） */
        current?: number;
        total?: number;
    }>(),
    {
        current: 0,
        total: 0
    }
);

const emits = defineEmits<{
    (e: "update:show", value: boolean): void;
    (e: "jump", page: number): void;
}>();

const inputRef = ref<{ focus: () => void } | null>(null);
/** 输入框里是 1 基页码，对外仍用 0 基 */
const page = ref<number | null>(1);

const modelShow = computed({
    get() {
        return props.show;
    },
    set(value: boolean) {
        emits("update:show", value);
    }
});

// 每次打开都回填当前页并聚焦，方便直接改数字
watch(
    () => props.show,
    (show) => {
        if (!show) {
            return;
        }
        page.value = props.current + 1;
        nextTick(() => inputRef.value?.focus());
    }
);

const confirm = () => {
    const max = Math.max(props.total, 1);
    const target = Math.min(Math.max(Math.round(page.value ?? props.current + 1), 1), max);
    emits("jump", target - 1);
    modelShow.value = false;
};
</script>

<style scoped>
.page-jump__input {
    width: 100%;
}

.page-jump__hint {
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.6;
}
</style>
