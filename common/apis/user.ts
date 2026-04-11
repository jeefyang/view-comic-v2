import { apiUrlsTrans } from "./tools/apiUrlsTrans";

export const UserApiUrl = apiUrlsTrans("user/", {
    login: { method: "POST", from: {} as { username: string, password: string; }, to: {} as WebUserType },
    edit: {
        method: "POST", from: {} as {
            username: string, password: string, newPassword?: string, newUsername?: string,
        }
    },
    groupList: { method: "GET", to: {} as string[] },
    add: {
        method: "POST", from: {} as {
            newUsername: string, adminToken: string, newPassword: string, adminUser: string, group: string;
        }
    },
    delete: {
        method: "POST", from: {} as {
            adminToken: string, adminUser: string, username: string;
        }
    },
    list: { method: "GET", to: {} as WebUserType[] }

});


