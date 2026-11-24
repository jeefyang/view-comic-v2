<template>
    <div class="st-scope st-account">
        <section class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">01</span>
                <h2 class="st-panel-title">当前身份</h2>
                <span class="st-panel-value">{{ configStore.isLogin ? "已登录" : "未登录" }}</span>
            </header>

            <div v-if="configStore.isLogin" class="st-id">
                <div class="st-id-mark" aria-hidden="true">{{ initial }}</div>
                <div class="st-id-body">
                    <div class="st-id-name">{{ configStore.username }}</div>
                    <div class="st-id-role"><em>{{ roleLabel }}</em> · {{ configStore.userUUID }}</div>
                </div>
            </div>

            <div v-else class="st-empty">
                这台设备还没有登录账号。
                <div class="st-empty-actions">
                    <button class="st-btn st-btn--primary" type="button" @click="handleTransUser">去登录</button>
                </div>
            </div>

            <p class="st-panel-note">
                账号与阅读进度存在服务端，换个浏览器登录也会同步回来；缩略图与媒体缓存只在本机。
            </p>
        </section>

        <section v-if="configStore.isLogin" class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">02</span>
                <h2 class="st-panel-title">账号管理</h2>
            </header>
            <div class="st-list" style="margin-top: 6px">
                <button class="st-action" type="button" @click="showEditUser = true">
                    <span class="st-action-main">
                        <span class="st-action-title">修改用户名 / 密码</span>
                        <span class="st-action-desc">更新当前账号的登录名与密码</span>
                    </span>
                    <svg class="st-action-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
                <button v-if="isAdmin" class="st-action" type="button" @click="showAddUser = true">
                    <span class="st-action-main">
                        <span class="st-action-title">添加用户</span>
                        <span class="st-action-desc">给其他人开一个独立账号，进度与书签各存各的</span>
                    </span>
                    <svg class="st-action-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
                <button v-if="isAdmin" class="st-action" type="button" @click="showUserList = true">
                    <span class="st-action-main">
                        <span class="st-action-title">用户列表</span>
                        <span class="st-action-desc">查看、编辑或删除已有账号</span>
                    </span>
                    <svg class="st-action-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            </div>
        </section>

        <section v-if="configStore.isLogin" class="st-panel">
            <header class="st-panel-head">
                <span class="st-panel-index">03</span>
                <h2 class="st-panel-title">会话</h2>
            </header>
            <div class="st-list" style="margin-top: 6px">
                <button class="st-action" type="button" @click="handleTransUser">
                    <span class="st-action-main">
                        <span class="st-action-title">切换账号</span>
                        <span class="st-action-desc">不退出当前账号，直接登录另一个</span>
                    </span>
                    <svg class="st-action-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
                <button class="st-action st-action--danger" type="button" @click="handleLogout">
                    <span class="st-action-main">
                        <span class="st-action-title">退出登录</span>
                        <span class="st-action-desc">清除本机登录状态，以及这个账号在本机的媒体缓存</span>
                    </span>
                    <svg class="st-action-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            </div>
        </section>

        <ModalEditUser v-model:show="showEditUser" />
        <ModalAddUser v-model:show="showAddUser" />
        <ModalUserList v-model:show="showUserList" />
    </div>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { useConfigStore } from "@/stores/config";
import ModalEditUser from "@/views/settings/components/ModalEditUser.vue";
import ModalAddUser from "@/views/settings/components/ModalAddUser.vue";
import ModalUserList from "@/views/settings/components/ModalUserList.vue";

const configStore = useConfigStore();

const showEditUser = ref(false);
const showAddUser = ref(false);
const showUserList = ref(false);

const isAdmin = computed(() => configStore.userType == "admin");

const initial = computed(() => (configStore.username || "?").trim().slice(0, 1).toUpperCase());

const roleLabel = computed(() => (configStore.userType === "admin" ? "管理员" : "普通用户"));

const handleTransUser = () => {
    configStore.showLogin = true;
};

const handleLogout = () => {
    configStore.toLogout();
};
</script>
