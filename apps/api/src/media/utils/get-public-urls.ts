import path from "path";
import {
    CDN_ENDPOINT,
    CLOUD_ENDPOINT,
    PATH_PREFIX,
    CLOUD_ENDPOINT_PUBLIC,
} from "@/config/constants";
import { Constants, Media } from "@medialit/models";
import { PATH_KEY } from "./generate-key";

const prefix = PATH_PREFIX ? `${PATH_PREFIX}/` : "";

export function getMainFileUrl(media: Media) {
    const ENDPOINT =
        CDN_ENDPOINT ||
        (media.accessControl === Constants.AccessControl.PUBLIC
            ? CLOUD_ENDPOINT_PUBLIC || CLOUD_ENDPOINT
            : CLOUD_ENDPOINT);
    return `${ENDPOINT}/${prefix}${PATH_KEY.PUBLIC}/${media.mediaId}/main${path.extname(
        media.fileName,
    )}`;
}

export function getThumbnailUrl(media: Media) {
    const ENDPOINT = CDN_ENDPOINT || CLOUD_ENDPOINT_PUBLIC;
    return `${ENDPOINT}/${prefix}${PATH_KEY.PUBLIC}/${media.mediaId}/thumb.webp`;
}
