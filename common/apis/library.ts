import { apiUrlsTrans } from "./tools/apiUrlsTrans";

export const LibraryApiUrl = apiUrlsTrans("library/", {
    getList: { method: "GET", to: {} as JsonLibrary[] },
    folderList: { method: "POST", from: {} as Partial<JsonLibrary>, to: {} as { list: string[]; } },
    folderTest: { method: "POST", from: {} as Partial<JsonLibrary> },
    add: { method: "POST", from: {} as EditLibraryType, to: {} as JsonLibrary },
    remove: { method: "POST", from: {} as EditLibraryType, to: {} as JsonLibrary },
    edit: { method: "POST", from: {} as EditLibraryType, to: {} as JsonLibrary },
    update: { method: "POST", from: {} as EditLibraryType, to: {} as JsonLibrary }
});


