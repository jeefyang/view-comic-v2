import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { viewFetch } from '@/utils/jFetch';

export const useViewStore = defineStore('view', () => {
    const saveKey = "view";
    const curLibrary = ref(<JsonLibrary>{});
    const shelfPath = ref(<string[]>[]);
    const shelfFolder = ref(<viewFolderType | undefined>undefined);
    const shelfFileList = ref(<ViewFileType[]>[]);
    const shelfSearchKey = ref("");
    const shelfSortType = ref(<SortNameType>"updateTime");
    const shelfSortValue = ref(<1 | -1>1);
    const shelfIncludeType = ref(<IncludeFileType>"filefolder");
    const shelfJumpName = ref(<string>"");
    const shelfScrollName = ref(<string>"");
    const shelfLoading = ref(false);


    const returnData = {
        curLibrary, shelfPath, shelfSearchKey, shelfSortType, shelfSortValue
        , shelfIncludeType, shelfScrollName
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

    const updateShelfFolder = async (isSort = true) => {
        if (!curLibrary.value.editUUID) {
            shelfFolder.value = undefined;
            return;
        }
        shelfLoading.value = true;
        const res = await viewFetch.request("folder", { editUUID: curLibrary.value.editUUID!, path: shelfPath.value.join('/') });
        shelfLoading.value = false;
        if (res.code != 200) {
            shelfFolder.value = undefined;

            return res;
        }
        shelfFolder.value = res.data;
        if (!isSort) {
            return;
        }
        sortShelfFileList();
    };

    const sortShelfFileList = () => {
        if (!shelfFolder.value) {
            shelfFileList.value = [];
            return;
        }
        shelfFileList.value = [...shelfFolder.value!.list];
        shelfScrollName.value = "";
        return [...shelfFileList.value];
    };

    const setLibrary = (item: JsonLibrary) => {
        curLibrary.value = item;
        save();
    };

    const getShelfJump = () => {
        const index = shelfFileList.value.findIndex(item => item.name == shelfJumpName.value);
        shelfJumpName.value = "";
        return index == -1 ? 0 : index;
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
        shelfJumpName,
        getShelfJump,
        shelfLoading
    };
});