import { ConfigApiUrl } from "@common/apis/config";
import { LibraryApiUrl } from "@common/apis/library";
import { TransFetch } from "@common/apis/tools/transFetch";
import { UserApiUrl } from "@common/apis/user";
import { ViewApiUrl } from "@common/apis/view";

const prevUrl = "api/";
export const userFetch = new TransFetch(UserApiUrl, prevUrl);
export const configFetch = new TransFetch(ConfigApiUrl, prevUrl);
export const libraryFetch = new TransFetch(LibraryApiUrl, prevUrl);
export const viewFetch = new TransFetch(ViewApiUrl, prevUrl);


