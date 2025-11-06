import path from "path";
import { CDN_ENDPOINT, CLOUD_ENDPOINT, PATH_PREFIX } from "@/config/constants";
import { Media } from "@medialit/models";

export const ENDPOINT = CDN_ENDPOINT || CLOUD_ENDPOINT;
const prefix = PATH_PREFIX ? `${PATH_PREFIX}/` : "";

export function getMainFileUrl(media: Media) {
    return `${ENDPOINT}/${prefix}public/${media.mediaId}/main${path.extname(
        media.fileName,
    )}`;
}

export function getThumbnailUrl(mediaId: string) {
    return `${ENDPOINT}/${prefix}public/${mediaId}/thumb.webp`;
}
