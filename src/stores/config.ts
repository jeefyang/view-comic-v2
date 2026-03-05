import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useConfigStore = defineStore('config', () => {
    const token = ref("");
    const username = ref("");
    const userType = ref(<UserTypeType>"user");
    const curLibrary = ref(<LibraryType>{});
    const saveKey = "config";
    const showLogin = ref(false);

    const isLogin = computed(() => {
        return !!token.value && !!username.value;
    });

    const returnData = {
        userType, token, username, curLibrary
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

    const setLibrary = (item: LibraryType) => {
        curLibrary.value = item;
        save();
    };



    const toLogin = (data: WebUserType) => {
        username.value = data.username;
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

    load();
    return { ...returnData, showLogin, save, load, clear, setLibrary, toLogin, toLogout, isLogin };
});
