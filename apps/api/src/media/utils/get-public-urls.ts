import path from "path";
import { ENDPOINT, CLOUD_PREFIX } from "../../config/constants";
import { Media } from "@medialit/models";

const prefix = CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : "";

export function getMainFileUrl(media: Media) {
    return `${ENDPOINT}/${prefix}public/${media.mediaId}/main${path.extname(
        media.fileName,
    )}`;
}

export function getThumbnailUrl(mediaId: string) {
    return `${ENDPOINT}/${prefix}public/${mediaId}/thumb.webp`;
}
