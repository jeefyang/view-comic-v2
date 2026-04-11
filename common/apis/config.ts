import { apiUrlsTrans } from "./tools/apiUrlsTrans";

export const ConfigApiUrl = apiUrlsTrans("config/", {
    getConfig: { method: "GET", to: {} as JsonConfig }
});


