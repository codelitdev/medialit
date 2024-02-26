import path from "path";
import { cdnEndpoint, CLOUD_PREFIX } from "../../config/constants";
import { Media } from "@medialit/models";

export function getMainFileUrl(media: Media) {
    return `${cdnEndpoint}/${CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""}${
        media.mediaId
    }/main${path.extname(media.fileName)}`;
}
export function getThumbnailUrl(mediaId: string) {
    return `${cdnEndpoint}/${
        CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""
    }${mediaId}/thumb.webp`;
}
