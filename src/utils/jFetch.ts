import { useConfigStore } from "@/stores/config";
import { ConfigApiUrl } from "@common/apis/config";
import { LibraryApiUrl } from "@common/apis/library";
import type { ResultType } from "@common/apis/tools/apiUrlsTrans";
import { TransFetch } from "@common/apis/tools/transFetch";
import { UserApiUrl } from "@common/apis/user";

const prevUrl = "api/";
export const userFetch = new TransFetch(UserApiUrl, prevUrl);
export const configFetch = new TransFetch(ConfigApiUrl, prevUrl);
export const libraryFetch = new TransFetch(LibraryApiUrl, prevUrl);

[userFetch, configFetch, libraryFetch].forEach(item => {
    item.getHeaderFn = async () => {
        const config = useConfigStore();
        const headers = new Headers({
            "Content-Type": "application/json",
            "token": config.token || "",

        });
        return headers;
    };

    item.addListener("afterFetch", async (key: string, res: ResultType<any> | undefined) => {
        if (res?.code == 401) {
            console.warn("请登录");
            const configStore = useConfigStore();
            configStore.token = "";
            configStore.save();
            configStore.showLogin = true;
        }
        return;
    });
});

