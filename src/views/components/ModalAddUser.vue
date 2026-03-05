<template>
    <n-modal v-model:show="modelShow">
        <n-card style="width: 600px" title="添加用户" :bordered="false" role="dialog" aria-modal="true">
            <n-form ref="formRef" :model="formData">
                <n-form-item path="username" label="用户名">
                    <n-input v-model:value="formData.newUsername" placeholder="请输入用户名" />
                </n-form-item>
                <n-form-item path="password" label="密码">
                    <n-input v-model:value="formData.newPassword" type="password" placeholder="请输入密码" />
                </n-form-item>
                <n-form-item path="password" label="重复密码">
                    <n-input v-model:value="formData.repeatPassword" type="password" placeholder="请输入密码" />
                </n-form-item>
            </n-form>
            <template #footer>
                <n-button class="mr-4" @click="modelShow = false">取消</n-button>
                <n-button type="primary" @click="toAdd">修改</n-button>
            </template>
        </n-card>
    </n-modal>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { jFetch } from "@/utils/jFetch";
import { config } from "dotenv";
import { useMessage } from "naive-ui";
import { computed, reactive, ref } from "vue";

const props = defineProps<{
    show: boolean;
}>();

const formRef = ref(null);

const formData = reactive({
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
        formData.newPassword = "";
        formData.newUsername = "";
        formData.repeatPassword = "";
        emits("update:show", value);
    }
});

const toAdd = async () => {
    if (!configSotre.isLogin) {
        msg.warning("请先登录");
        return;
    }
    if (configSotre.userType != "admin") {
        msg.warning("权限不足");
        return;
    }
    if (!formData.newPassword || !formData.newUsername) {
        msg.warning("用户名/密码不能为空");
        return;
    }
    if (formData.newPassword != formData.repeatPassword) {
        msg.warning("密码不一致");
        return;
    }

    const res = await jFetch<WebUserType>({ method: "POST", url: "/api/user/add", data: { ...formData, adminToken: configSotre.token, adminUser: configSotre.username } });
    if (res.code != 200) {
        msg.error(res.msg || "");
        return;
    }
    modelShow.value = false;
};
</script>
