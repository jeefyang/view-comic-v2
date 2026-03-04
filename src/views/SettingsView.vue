<template>
    <div class="parent">
        <div class="user ml-3 mb-2">{{ configStore.userName || "无用户" }}</div>
        <n-flex vertical style="gap: 10px">
            <XBlockButton class="btn">修改用户/密码</XBlockButton>
            <XBlockButton class="btn">清除缩略图缓存</XBlockButton>
            <XBlockButton class="btn">清除历史记录</XBlockButton>
            <XBlockButton class="btn">清除书签记录</XBlockButton>
            <XBlockButton class="btn">清除当前客户端缓存</XBlockButton>
            <XBlockButton class="btn">退出登录</XBlockButton>
        </n-flex>
    </div>
</template>
<script lang="ts" setup>
import { ref } from "vue";
import XBlockButton from "@/components/XBlockButton.vue";
import { useDialog } from "naive-ui";
import { useConfigStore } from "@/stores/config";
const dialog = useDialog();

const configStore = useConfigStore();

const handleClearCache=(key:string)=>{

}

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
