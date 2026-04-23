import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { libraryFetch, userFetch } from '@/utils/jFetch';

export const useConfigStore = defineStore('config', () => {
    const token = ref("");
    const username = ref("");
    const userUUID = ref("");
    const userType = ref(<UserTypeType>"user");
    const padding = ref(2);
    const pageMargin = ref(2);


    const saveKey = "config";
    const showLogin = ref(false);
    const isInit = ref(false);

    const groupList = ref(<{ label: string, value: string, key: string; }[]>[]);

    const isLogin = computed(() => {
        return !!token.value && !!username.value;
    });


    const cloudData = {
        padding,pageMargin
    };

    const returnData = {
        userType, token, username, userUUID
    };

    const save = () => {
        const obj: any = {};
        for (let key in returnData) {
            obj[key] = returnData[key].value;
        }
        localStorage.setItem(saveKey, JSON.stringify(obj));
    };

    const load = () => {
        const config = localStorage.getItem(saveKey);
        if (config) {
            const obj = JSON.parse(config);
            for (let key in obj) {
                if (returnData[key]) {
                    returnData[key].value = obj[key];
                }

            }
        }
    };

    const clear = () => {
        localStorage.removeItem(saveKey);
    };


    const toLogin = (data: WebUserType) => {
        username.value = data.username;
        userUUID.value = data.uuid;
        token.value = data.token || "";
        userType.value = data.type;
        save();
    };

    const toLogout = () => {
        username.value = "";
        token.value = "";
        userType.value = "user";
        save();
    };


    const updateGroupList = async () => {
        const res = await userFetch.request('groupList');
        if (res.code == 200) {
            groupList.value = res.data!.map(c => ({ label: c, value: c, key: c }));
        }
        return res;
    };

    const initConfig = async () => {
        const res = await userFetch.request('getUserConfig');
        if (res.code != 200) {
            return res;
        }
        const cloudKeys = Object.keys(res.data!);
        Object.keys(cloudData).forEach(key => {
            if (cloudKeys.includes(key)) {
                cloudData[key].value = res.data![key];
            }
        });

        return res;
    };



    load();
    return { ...returnData, ...cloudData, showLogin, save, load, clear, toLogin, toLogout, isLogin, groupList, updateGroupList, isInit, initConfig };
});
