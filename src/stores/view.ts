import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { viewFetch } from '@/utils/jFetch';

export const useViewStore = defineStore('view', () => {
    const saveKey = "view";
    const curLibrary = ref(<JsonLibrary>{});
    const shelfPath = ref("");
    const shelfFolder = ref(<viewFolderType | undefined>undefined);
    const shelfFileList = ref(<ViewFileType[]>[]);
    const shelfSearchKey = ref("");
    const shelfSortType = ref(<SortNameType>"updateTime");
    const shelfSortValue = ref(<1 | -1>1);
    const shelfIncludeType = ref(<IncludeFileType>"filefolder");


    const returnData = {
        curLibrary, shelfPath, shelfSearchKey, shelfSortType, shelfSortValue
        , shelfIncludeType
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
                if (returnData[key]) {
                    //@ts-expect-error
                    returnData[key].value = obj[key];
                }

            }
        }
    };

    const updateShelfFolder = async () => {
        if (!curLibrary.value.editUUID) {
            shelfFolder.value = undefined;
        }
        const res = await viewFetch.request("folder", { editUUID: curLibrary.value.editUUID!, path: shelfPath.value });
        if (res.code != 200) {
            shelfFolder.value = undefined;
            return res;
        }
        shelfFolder.value = res.data;
    };

    const sortShelfFileList = () => {
        if (!shelfFolder.value) {
            shelfFileList.value = [];
            return;
        }
        shelfFileList.value=[...shelfFolder.value!.list]
        return [... shelfFileList.value];
    };

    const setLibrary = (item: JsonLibrary) => {
        curLibrary.value = item;
        save();
    };


    load();

    return {
        ...returnData,
        save,
        load,
        setLibrary,
        shelfFolder,
        updateShelfFolder,
        shelfFileList,
        sortShelfFileList,
    };
});