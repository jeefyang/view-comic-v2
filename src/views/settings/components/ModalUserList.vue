<template>
    <n-modal v-model:show="modelShow" @after-enter="onShow" preset="card" :title="editItem ? `用户修改` : '用户列表'" style="width: 600px">
        <template v-if="!editItem">
            <n-flex vertical style="max-height: 40vh; overflow: auto">
                <n-table :bordered="false" :single-line="false">
                    <thead>
                        <tr class="flex">
                            <th style="flex: 0.25">用户名</th>
                            <th style="flex: 0.25">用户类型</th>
                            <th style="flex: 0.25">分组</th>
                            <th style="flex: 0.25">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="flex" v-for="item in datalist" :key="item.username">
                            <td style="flex: 0.25">{{ item.username }}</td>
                            <td style="flex: 0.25">{{ item.type }}</td>
                            <td style="flex: 0.25">{{ item.group }}</td>
                            <td style="flex: 0.25">
                                <!-- <n-button v-if="item.type != 'admin'" @click="toDel(item)" type="error">删除</n-button> -->
                                <n-button v-if="item.type != 'admin'" type="primary" @click="toEdit(item)">修改</n-button>
                            </td>
                        </tr>
                    </tbody>
                </n-table>
            </n-flex>
            <n-divider></n-divider>
            <n-flex>
                <n-button class="mr-4" @click="modelShow = false">取消</n-button>
                <n-button type="primary" @click="getList()">刷新</n-button>
            </n-flex>
        </template>
        <template v-else>
            <n-form>
                <n-form-item label="用户名">
                    {{ editItem.username }}
                </n-form-item>
            </n-form>
            <n-divider></n-divider>
            <n-flex>
                <n-button @click="modelShow = false">取消</n-button>
                <n-button v-if="editItem.type != 'admin'" @click="toDel(editItem)" type="error">删除</n-button>
                <n-button type="primary" @click="editItem = undefined">返回</n-button>
            </n-flex>
        </template>
    </n-modal>
</template>
<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { userFetch } from "@/utils/jFetch";
import { useDialog, useMessage } from "naive-ui";
import { computed, ref } from "vue";
import XDropdownInput from "@/components/XDropdownInput.vue";

const props = defineProps<{
    show: boolean;
}>();

const formRef = ref(null);

const datalist = ref(<WebUserType[]>[]);

const dialog = useDialog();

const configSotre = useConfigStore();
const msg = useMessage();

const editItem = ref(<WebUserType | undefined>undefined);

const emits = defineEmits<{
    (e: "update:show", value: boolean): void;
}>();

const modelShow = computed({
    get() {
        return props.show;
    },
    set(value: boolean) {
        emits("update:show", value);
    }
});

const onShow = () => {
    editItem.value = undefined;
    getList();
};

const toEdit = async (item: WebUserType) => {
    editItem.value = item;
};

const getList = async () => {
    const res = await userFetch.request("list");
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
            const res = await userFetch.request("delete", { username: item.username, adminToken: configSotre.token, adminUser: configSotre.username });
            if (res.code != 200) {
                msg.error(res.msg || "");
                return;
            }
            msg.success("删除成功");
            getList();
        }
    });
};
</script>
