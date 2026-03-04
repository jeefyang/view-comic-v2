import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useConfigStore = defineStore('config', () => {
    const token = ref("");
    const userName = ref("");
    const curLibrary = ref(<LibraryType>{});
    const saveKey = "config";
    const showLogin = ref(false);

    const returnData = {
        token, userName, curLibrary
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


    return { ...returnData, showLogin, save, load, clear, setLibrary };
});
