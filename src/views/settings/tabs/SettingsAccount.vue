<template>
    <n-flex vertical style="gap: 10px">
        <div class="user ml-3 mb-2" :style="{ color: themeVars.primaryColor }">
            {{ configStore.username || "无用户" }}{{ configStore.username ? `(${configStore.userType})` : "" }}
        </div>

        <XBlockButton class="btn" v-if="configStore.isLogin" @click="showEditUser = true">修改用户名/密码</XBlockButton>
        <XBlockButton class="btn" v-if="configStore.isLogin && configStore.userType == 'admin'" @click="showAddUser = true">添加用户</XBlockButton>
        <XBlockButton class="btn" v-if="configStore.isLogin && configStore.userType == 'admin'" @click="showUserList = true">用户列表</XBlockButton>

        <XBlockButton class="btn" @click="handleTransUser">切换账号</XBlockButton>
        <XBlockButton class="btn" @click="handleLogout">退出登录</XBlockButton>

        <ModalEditUser v-model:show="showEditUser"></ModalEditUser>
        <ModalAddUser v-model:show="showAddUser"></ModalAddUser>
        <ModalUserList v-model:show="showUserList"></ModalUserList>
    </n-flex>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { useThemeVars } from "naive-ui";
import XBlockButton from "@/components/XBlockButton.vue";
import { useConfigStore } from "@/stores/config";
import ModalEditUser from "@/views/settings/components/ModalEditUser.vue";
import ModalAddUser from "@/views/settings/components/ModalAddUser.vue";
import ModalUserList from "@/views/settings/components/ModalUserList.vue";

const themeVars = useThemeVars();
const configStore = useConfigStore();

const showEditUser = ref(false);
const showAddUser = ref(false);
const showUserList = ref(false);

const handleTransUser = () => {
    configStore.showLogin = true;
};

const handleLogout = () => {
    configStore.toLogout();
};
</script>

<style scoped lang="scss">
.user {
    font-size: x-large;
}

.btn {
    font-size: large;
}
</style>
