import { apiUrlsTrans } from "./tools/apiUrlsTrans";

export const ViewApiUrl = apiUrlsTrans("view/", {
    folder: { method: "GET", from: {} as { path: string, editUUID: string; }, to: {} as ViewFileType[] }

});

