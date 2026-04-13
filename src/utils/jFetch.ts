import { ConfigApiUrl } from "@common/apis/config";
import { LibraryApiUrl } from "@common/apis/library";
import { TransFetch } from "@common/apis/tools/transFetch";
import { UserApiUrl } from "@common/apis/user";

const prevUrl = "api/";
export const userFetch = new TransFetch(UserApiUrl, prevUrl);
export const configFetch = new TransFetch(ConfigApiUrl, prevUrl);
export const libraryFetch = new TransFetch(LibraryApiUrl, prevUrl);


