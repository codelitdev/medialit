import path from "path";
import {
    CDN_ENDPOINT,
    CLOUD_ENDPOINT,
    PATH_PREFIX,
    CLOUD_ENDPOINT_PUBLIC,
} from "@/config/constants";
import { Constants, Media } from "@medialit/models";

const prefix = PATH_PREFIX ? `${PATH_PREFIX}/` : "";

export function getPublicFileUrl(media: Media) {
    const ENDPOINT =
        CDN_ENDPOINT ||
        (media.accessControl === Constants.AccessControl.PUBLIC
            ? CLOUD_ENDPOINT_PUBLIC || CLOUD_ENDPOINT
            : CLOUD_ENDPOINT);
    return `${ENDPOINT}/${prefix}${Constants.PathKey.PUBLIC}/${media.mediaId}/main${path.extname(
        media.fileName,
    )}`;
}

export function getThumbnailUrl(media: Media) {
    const ENDPOINT = CDN_ENDPOINT || CLOUD_ENDPOINT_PUBLIC;
    return `${ENDPOINT}/${prefix}${Constants.PathKey.PUBLIC}/${media.mediaId}/thumb.webp`;
}
