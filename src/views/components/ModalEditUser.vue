<template>
    <n-modal v-model:show="modelShow">
        <n-card style="width: 600px" title="修改用户" :bordered="false" role="dialog" aria-modal="true">
            <n-form ref="formRef" :model="formData">
                <n-form-item path="username" label="用户名">
                    {{ configSotre.username }}
                </n-form-item>
                <n-form-item path="password" label="密码">
                    <n-input v-model:value="formData.password" type="password" placeholder="请输入密码" />
                </n-form-item>
                <n-form-item path="username" label="更改用户名">
                    <n-input v-model:value="formData.newUsername" placeholder="需要修改请输入" />
                </n-form-item>
                <n-form-item path="username" label="更改密码">
                    <n-input v-model:value="formData.newPassword" type="password" placeholder="需要修改请输入" />
                </n-form-item>
                <n-form-item path="username" label="重复密码">
                    <n-input v-model:value="formData.repeatPassword" type="password" placeholder="需要修改请输入" />
                </n-form-item>
            </n-form>
            <template #footer>
                <n-button class="mr-4" @click="modelShow = false">取消</n-button>
                <n-button type="primary" @click="toEdit">修改</n-button>
            </template>
        </n-card>
    </n-modal>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { jFetch } from "@/utils/jFetch";
import { useMessage } from "naive-ui";
import { computed, reactive, ref } from "vue";

const props = defineProps<{
    show: boolean;
}>();

const formRef = ref(null);

const formData = reactive({
    password: "",
    newUsername: "",
    newPassword: "",
    repeatPassword: ""
});

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
        formData.password = "";
        formData.newUsername = "";
        formData.newPassword = "";
        formData.repeatPassword = "";
        emits("update:show", value);
    }
});

const toEdit = async () => {
    if (!configSotre.isLogin) {
        msg.warning("请先登录");
        return;
    }
    if (!formData.password) {
        msg.warning("密码不能为空");
        return;
    }
    if (!formData.newUsername && !formData.newPassword) {
        msg.warning("请填写需要修改的项");
        return;
    }
    if (formData.newPassword != formData.repeatPassword) {
        msg.error("密码不一致");
        return;
    }

    const res = await jFetch<WebUserType>({ method: "POST", url: "/api/user/edit", data: { ...formData, username: configSotre.username } });
    if (res.code != 200) {
        msg.error(res.msg || "");
        return;
    }
    configSotre.toLogout();
    modelShow.value = false;
    configSotre.showLogin = true;
};
</script>
