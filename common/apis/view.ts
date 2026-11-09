import { apiUrlsTrans } from "./tools/apiUrlsTrans";


export const ViewApiUrl = apiUrlsTrans("view/", {
    folder: { method: "GET", from: {} as { path: string, editUUID: string; }, to: {} as viewFolderType },
    checkFolder: { method: "GET", from: {} as { path: string, editUUID: string; }, to: {} as boolean },
    comicViewList: { method: "POST", from: {} as { editUUID: string, path: string, file: ViewFileType; nameEncoding?: string; }, to: {} as ComicFileListType },
    clearThumbs: { method: "POST", from: {} as Record<string, never>, to: {} as { count: number } },
    clearPageCache: { method: "POST", from: {} as Record<string, never>, to: {} as { count: number } }
});

