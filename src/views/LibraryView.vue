<template>
    <n-flex vertical style="height: 100%">
        <n-flex style="width: 100%">
            <n-icon size="50" :color="themeVars.primaryColor" @click="addLibraryFn">
                <Add12Filled />
            </n-icon>
        </n-flex>
        <n-flex style="flex: 1; width: 100%" vertical justify="center" align="center">
            <n-empty description="书库是空的" size="huge"> </n-empty>
        </n-flex>
    </n-flex>
    <n-drawer v-model:show="openDrawer" placement="top" :height="500">
        <n-drawer-content :title="drawerTtitle">
            <n-form ref="formRef" :model="formData"> </n-form>
            <n-form-item label="仓库名" path="name">
                <n-input v-model:value="formData.name" placeholder="输入仓库名" />
            </n-form-item>
            <n-form-item label="路径" path="pathUrl">
                <n-dropdown trigger="click" :options="pathOptions" @select="handleSelectPathOption">
                    <n-input v-model:value="formData.pathUrl" placeholder="输入路径,/添加提示" @input="hadndlePathInput" />
                </n-dropdown>
            </n-form-item>
            <n-flex>
                <n-button type="primary">保存</n-button>
                <n-button>测试</n-button>
                <n-button>取消</n-button>
            </n-flex>
        </n-drawer-content>
    </n-drawer>
</template>

<script setup lang="ts">
import { darkTheme, useThemeVars } from "naive-ui";
import { onMounted, ref } from "vue";
import { Add12Filled } from "@vicons/fluent";
import { jFetch } from "@/utils/jFetch";

const themeVars = useThemeVars();
const openDrawer = ref(false);
const drawerTtitle = ref("新建");
const formRef = ref(null);

const formData = ref({
    name: "",
    pathUrl: ""
});

const pathOptions = ref(
    <
        {
            label: string;
            key: string;
            show?: boolean;
        }[]
    >[]
);

const hadndlePathInput = async (e: string) => {
    if (e.endsWith("/")) {
        const res = await jFetch({ method: "POST", url: "/api/library/folderList", data: { ...formData.value } });
        if(res)
    }
    console.log(e);
};

const handleSelectPathOption = (option: any) => {
    formData.value.pathUrl = option.key;
};

const addLibraryFn = () => {
    formData.value = {
        name: "",
        pathUrl: ""
    };
    openDrawer.value = true;
    drawerTtitle.value = "新建";
};

onMounted(() => {
    console.log(themeVars.value.primaryColor);
});
</script>
