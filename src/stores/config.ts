import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { libraryFetch, userFetch } from '@/utils/jFetch';

export const useConfigStore = defineStore('config', () => {
    const token = ref("");
    const username = ref("");
    const userUUID = ref("");
    const userType = ref(<UserTypeType>"user");
    const curLibrary = ref(<JsonLibrary>{});
    const saveKey = "config";
    const showLogin = ref(false);
    const libraryList = ref([] as JsonLibrary[]);
    const groupList = ref(<{ label: string, value: string, key: string; }[]>[]);

    const isLogin = computed(() => {
        return !!token.value && !!username.value;
    });

    const returnData = {
        userType, token, username, curLibrary, userUUID
    };

    const save = () => {
        const obj: any = {};
        for (let key in returnData) {
            //@ts-expect-error
            obj[key] = returnData[key].value;
        }
        localStorage.setItem(saveKey, JSON.stringify(obj));
    };

    const load = () => {
        const config = localStorage.getItem(saveKey);
        if (config) {
            const obj = JSON.parse(config);
            for (let key in obj) {
                //@ts-expect-error
                returnData[key].value = obj[key];
            }
        }
    };

    const clear = () => {
        localStorage.removeItem(saveKey);
    };

    const setLibrary = (item: JsonLibrary) => {
        curLibrary.value = item;
        save();
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

    const updateLibraryList = async () => {
        const res = await libraryFetch.request("getList");
        if (res.code == 200) {
            libraryList.value = res.data!;
        }
        return res;
    };

    const updateGroupList = async () => {
        const res = await userFetch.request('groupList');
        if (res.code == 200) {
            groupList.value = res.data!.map(c => ({ label: c, value: c, key: c }));
        }
        return res;
    };

    const init = async () => {
        await updateLibraryList();


    };

    load();
    return { ...returnData, showLogin, save, load, clear, setLibrary, toLogin, toLogout, isLogin, libraryList, groupList, updateLibraryList, updateGroupList, init };
});
