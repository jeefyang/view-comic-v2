import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { libraryFetch, userFetch } from '@/utils/jFetch';
import { clearMediaCacheForUser } from '@/utils/mediaCache';

/** 阅读边距默认值（px）：手机上一屏正好留出安全边距，又不至于浪费显示面积 */
export const DEFAULT_PADDING = 8;
/** 瀑布流图片间距默认值（px） */
export const DEFAULT_IMAGE_GAP = 6;

export const useConfigStore = defineStore('config', () => {
    const token = ref("");
    const username = ref("");
    const userUUID = ref("");
    const userType = ref(<UserTypeType>"user");
    /** 阅读边距（px）：上下左右各自独立，用来避开刘海、页码栏和屏幕圆角 */
    const paddingTop = ref(DEFAULT_PADDING);
    const paddingBottom = ref(DEFAULT_PADDING);
    const paddingLeft = ref(DEFAULT_PADDING);
    const paddingRight = ref(DEFAULT_PADDING);
    /** 瀑布流里两张图之间的可见空隙（px），内部按一半做上下 margin */
    const imageGap = ref(DEFAULT_IMAGE_GAP);


    const saveKey = "config";
    const showLogin = ref(false);
    const isInit = ref(false);

    const groupList = ref(<{ label: string, value: string, key: string; }[]>[]);

    const isLogin = computed(() => {
        return !!token.value && !!username.value;
    });


    const cloudData = {
        paddingTop, paddingBottom, paddingLeft, paddingRight, imageGap
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
        const scope = userUUID.value;
        username.value = "";
        token.value = "";
        userType.value = "user";
        save();
        // 媒体缓存按用户隔离：退出时只清这个用户前缀，不阻塞登出
        if (scope) {
            void clearMediaCacheForUser(scope);
        }
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
        // 旧版本云端只存了一个 padding / pageMargin，这里迁移成四向边距 + 图片间距
        const legacy = res.data as { padding?: number; pageMargin?: number; };
        if (!cloudKeys.includes("paddingTop") && typeof legacy.padding === "number") {
            paddingTop.value = legacy.padding;
            paddingBottom.value = legacy.padding;
            paddingLeft.value = legacy.padding;
            paddingRight.value = legacy.padding;
        }
        if (!cloudKeys.includes("imageGap") && typeof legacy.pageMargin === "number") {
            imageGap.value = legacy.pageMargin * 2;
        }

        return res;
    };



    let spacingTimer: ReturnType<typeof setTimeout> | undefined;

    /** 边距类的即时生效、延迟上云：拖动滑块时每动一次都发请求没必要 */
    const saveReaderSpacing = (delay = 500) => {
        if (spacingTimer) {
            clearTimeout(spacingTimer);
        }
        spacingTimer = setTimeout(() => {
            spacingTimer = undefined;
            if (!userUUID.value) {
                return;
            }
            // 服务端的 setUserConfig 是按 key 合并的，只传这几个字段不会碰
            // readHistory / bookmarks / tapZoneLayouts 等其它配置
            userFetch.request("setUserConfig", {
                userUUID: userUUID.value,
                paddingTop: paddingTop.value,
                paddingBottom: paddingBottom.value,
                paddingLeft: paddingLeft.value,
                paddingRight: paddingRight.value,
                imageGap: imageGap.value
            });
        }, delay);
    };

    /** 恢复默认边距 */
    const resetReaderSpacing = () => {
        paddingTop.value = DEFAULT_PADDING;
        paddingBottom.value = DEFAULT_PADDING;
        paddingLeft.value = DEFAULT_PADDING;
        paddingRight.value = DEFAULT_PADDING;
        imageGap.value = DEFAULT_IMAGE_GAP;
        saveReaderSpacing(0);
    };

    load();
    return { ...returnData, ...cloudData, saveReaderSpacing, resetReaderSpacing, showLogin, save, load, clear, toLogin, toLogout, isLogin, groupList, updateGroupList, isInit, initConfig };
});
