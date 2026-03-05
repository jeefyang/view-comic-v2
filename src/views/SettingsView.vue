<template>
    <div class="parent">
        <div class="user ml-3 mb-2" :style="{ color: themeVars.primaryColor }">{{ configStore.username || "无用户" }}{{ configStore.username ? `(${configStore.userType})` : "" }}</div>
        <n-flex vertical style="gap: 10px">
            <XBlockButton class="btn" v-if="configStore.isLogin" @click="showEditUser = true">修改用户名/密码</XBlockButton>
            <XBlockButton class="btn" v-if="configStore.isLogin && configStore.userType == 'admin'" @click="showAddUser = true">添加用户</XBlockButton>
            <XBlockButton class="btn" v-if="configStore.isLogin && configStore.userType == 'admin'" @click="showDeleteUser = true">删除用户</XBlockButton>

            <XBlockButton class="btn">清除缩略图缓存</XBlockButton>
            <XBlockButton class="btn">清除历史记录</XBlockButton>
            <XBlockButton class="btn">清除书签记录</XBlockButton>
            <XBlockButton class="btn" @click="handleClearCache">清除当前客户端缓存</XBlockButton>
            <XBlockButton class="btn" @click="handleTransUser">切换账号</XBlockButton>

            <XBlockButton class="btn" @click="handleLogout">退出登录</XBlockButton>
        </n-flex>
        <ModalEditUser v-model:show="showEditUser"></ModalEditUser>
        <ModalAddUser v-model:show="showAddUser"></ModalAddUser>
        <ModalDeleteUser v-model:show="showDeleteUser"></ModalDeleteUser>
    </div>
</template>
<script lang="ts" setup>
import { onActivated, onMounted, ref } from "vue";
import XBlockButton from "@/components/XBlockButton.vue";
import { useDialog, useThemeVars } from "naive-ui";
import { useConfigStore } from "@/stores/config";
import ModalEditUser from "./components/ModalEditUser.vue";
import ModalAddUser from "./components/ModalAddUser.vue";
import ModalDeleteUser from "./components/ModalDeleteUser.vue";

const dialog = useDialog();
const themeVars = useThemeVars();
const configStore = useConfigStore();

const showEditUser = ref(false);
const showDeleteUser = ref(false);
const showAddUser = ref(false);

const handleClearCache = () => {
    dialog.warning({
        title: "提示",
        content: `确定要清除客户端缓存吗？(将会触发刷新页面)`,
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: () => {
            configStore.clear();
            dialog.success({
                closable: false,
                maskClosable: false,
                title: "提示",
                content: `清除客户端缓存成功,将强制刷新页面`,
                positiveText: "刷新",
                onPositiveClick: () => {
                    window.location.reload();
                }
            });
        }
    });
};

const handleTransUser = () => {
    configStore.showLogin = true;
};

const handleLogout = () => {
    configStore.toLogout();
};

onActivated(async () => {
    if (!configStore.isLogin) {
        configStore.showLogin = true;
    }
});
</script>
<style scoped lang="scss">
.parent {
    .user {
        font-size: x-large;
    }
    .btn {
        font-size: large;
    }
}
</style>
