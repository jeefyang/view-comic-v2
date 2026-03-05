<template>
    <n-modal v-model:show="modelShow">
        <n-card style="width: 600px" title="删除用户" :bordered="false" role="dialog" aria-modal="true">
            <n-flex vertical>
                <n-table :bordered="false" :single-line="false">
                    <thead>
                        <tr class="flex">
                            <th style="flex: 0.5">用户名</th>
                            <th style="flex: 0.25">用户类型</th>
                            <th style="flex: 0.25">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="flex" v-for="item in datalist" :key="item.username">
                            <td style="flex: 0.5">{{ item.username }}</td>
                            <td style="flex: 0.25">{{ item.type }}</td>
                            <td style="flex: 0.25">
                                <n-button v-if="item.type != 'admin'" @click="toDel(item)" type="error">删除</n-button>
                            </td>
                        </tr>
                    </tbody>
                </n-table>
            </n-flex>
            <template #footer>
                <n-button class="mr-4" @click="modelShow = false">取消</n-button>
                <n-button type="primary" @click="getList()">刷新</n-button>
            </template>
        </n-card>
    </n-modal>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { jFetch } from "@/utils/jFetch";
import { config } from "dotenv";
import { useDialog, useMessage } from "naive-ui";
import { computed, onActivated, reactive, ref } from "vue";

const props = defineProps<{
    show: boolean;
}>();

const formRef = ref(null);

const datalist = ref(<WebUserType[]>[]);

const dialog = useDialog();

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
        value && getList();
        emits("update:show", value);
    }
});

const getList = async () => {
    const res = await jFetch<WebUserType[]>({ method: "GET", url: "/api/user/list" });
    if (res.code != 200) {
        msg.error(res.msg || "");
        return;
    }
    datalist.value = res.data!;
};

const toDel = async (item: WebUserType) => {
    dialog.warning({
        title: "删除用户",
        content: "确定要删除此用户吗？",
        positiveText: "确定",
        negativeText: "取消",
        onPositiveClick: async () => {
            const res = await jFetch<WebUserType>({ method: "POST", url: "/api/user/delete", data: { username: item.username, adminToken: configSotre.token, adminUser: configSotre.username } });
            if (res.code != 200) {
                msg.error(res.msg || "");
                return;
            }
            msg.success("删除成功");
            getList();
        }
    });
};

onActivated(() => {
    getList();
});
</script>
