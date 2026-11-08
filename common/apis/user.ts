import { apiUrlsTrans } from "./tools/apiUrlsTrans";

export const UserApiUrl = apiUrlsTrans("user/", {
    login: { method: "POST", from: {} as { username: string, password: string; }, to: {} as WebUserType },
    edit: {
        method: "POST", from: {} as {
            userUUID: string, password: string, newPassword?: string, newUsername?: string,
        }
    },
    groupList: { method: "GET", to: {} as string[] },
    add: {
        method: "POST", from: {} as {
            newUsername: string, adminToken: string, newPassword: string, adminUUID: string, group: string;
        }
    },
    editGroup: {
        method: "POST", from: {} as {
            adminToken: string, adminUUID: string, userUUID: string, group: string;
        }
    },
    delete: {
        method: "POST", from: {} as {
            adminToken: string, adminUUID: string, userUUID: string;
        }
    },
    list: { method: "GET", to: {} as WebUserType[] },
    getUserConfig: { method: "GET", to: {} as UserConfigType },
    setUserConfig: { method: "POST", from: {} as UserConfigType, to: {} as UserConfigType },
    /**
     * 历史增量写入：一次只发变化的那一条，不再整份列表上传。
     * op 为 upsert（新增/更新一条）、remove（按 id 删）、clear（清空）。
     */
    patchHistory: {
        method: "POST",
        from: {} as {
            userUUID: string;
            op: "upsert" | "remove" | "clear";
            item?: ReadHistoryItemType;
            id?: string;
        },
        to: {} as UserConfigType,
    },
    /** 书签增量写入，语义同 patchHistory */
    patchBookmarks: {
        method: "POST",
        from: {} as {
            userUUID: string;
            op: "upsert" | "remove" | "clear";
            item?: BookmarkItemType;
            id?: string;
        },
        to: {} as UserConfigType,
    },
    /** 单个点击区域布局的增量写入：保存一个布局只发这一个 */
    patchTapZoneLayout: {
        method: "POST",
        from: {} as {
            userUUID: string;
            op: "set" | "remove";
            name: string;
            zones?: UserTapZoneItemType[];
        },
        to: {} as UserConfigType,
    },

});


