<template>
    <n-modal v-model:show="modelShow">
        <n-card style="width: 600px" title="登录" :bordered="false" role="dialog" aria-modal="true">
            <n-form ref="formRef" :model="formData">
                <n-form-item path="username" label="用户名">
                    <n-input v-model:value="formData.username" placeholder="请输入用户名" />
                </n-form-item>
                <n-form-item path="password" label="密码">
                    <n-input v-model:value="formData.password" placeholder="请输入密码" />
                </n-form-item>
            </n-form>
            <template #footer>
                <n-button v-if="configSotre.token" @click="modelShow = false">取消</n-button>
                <n-button type="primary" @click="toLogin">登录</n-button>
            </template>
        </n-card>
    </n-modal>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { jFetch } from "@/utils/jFetch";
import { useMessage } from "naive-ui";
import { computed, ref } from "vue";

const props = defineProps<{
    show: boolean;
}>();

const formRef = ref(null);

const formData = {
    username: "",
    password: ""
};

const configSotre = useConfigStore();
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
    if (!formData.username || !formData.password) {
        msg.warning("用户名/密码不能为空");
    }
    const res=await jFetch({ method: "POST", url: "/api/user/login", data: { ...formData } });
};
</script>
