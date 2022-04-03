import { cdnEndpoint, CLOUD_PREFIX } from "../../config/constants";
import { Media } from "../model";

export function getMainFileUrl(media: Media) {
    return `${cdnEndpoint}/${CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""}${
        media.mediaId
    }/main.${media.mimeType.split("/")[1]}`;
}
export function getThumbnailUrl(mediaId: string) {
    return `${cdnEndpoint}/${
        CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""
    }${mediaId}/thumb.webp`;
}
