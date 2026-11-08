<template>
    <n-modal v-model:show="modelShow" :mask-closable="false">
        <n-card style="width: 600px" title="登录" :bordered="false" role="dialog" aria-modal="true">
            <n-form ref="formRef" :model="formData" @submit.prevent="toLogin">
                <n-form-item path="username" label="用户名">
                    <n-input v-model:value="formData.username" placeholder="请输入用户名" :disabled="loading" autofocus @keyup.enter="toLogin" />
                </n-form-item>
                <n-form-item path="password" label="密码">
                    <n-input v-model:value="formData.password" type="password" placeholder="请输入密码" show-password-on="click" :disabled="loading" @keyup.enter="toLogin" />
                </n-form-item>
            </n-form>
            <template #footer>
                <n-button class="mr-4" v-if="configStore.token" :disabled="loading" @click="modelShow = false">取消</n-button>
                <n-button type="primary" :loading="loading" @click="toLogin">登录</n-button>
            </template>
        </n-card>
    </n-modal>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { useViewStore } from "@/stores/view";
import { userFetch } from "@/utils/jFetch";
import { useMessage } from "naive-ui";
import { computed, reactive, ref } from "vue";

const props = defineProps<{
    show: boolean;
}>();

const formRef = ref(null);

/** 提交中：防回车 + 点击双触发，顺便给按钮 loading */
const loading = ref(false);

const formData = reactive({
    username: "",
    password: ""
});

const configStore = useConfigStore();
const viewStore = useViewStore();
const msg = useMessage();

const emits = defineEmits<{
    (e: "update:show", value: boolean): void;
}>();

const modelShow = computed({
    get() {
        return props.show;
    },
    set(value: boolean) {
        formData.username = "";
        formData.password = "";
        emits("update:show", value);
    }
});

const toLogin = async () => {
    if (loading.value) {
        return;
    }
    if (!formData.username || !formData.password) {
        msg.warning("用户名/密码不能为空");
        return;
    }
    loading.value = true;
    try {
        const res = await userFetch.request("login", { ...formData });
        if (res.code != 200) {
            msg.error(res.msg || "");
            return;
        }
        configStore.toLogin(res.data!);
        configStore.updateGroupList();
        viewStore.updateLibraryList();
        await configStore.initConfig();
        modelShow.value = false;
    } finally {
        loading.value = false;
    }
};
</script>
