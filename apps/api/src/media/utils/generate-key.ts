import { PathKey } from "@medialit/models";
import { PATH_PREFIX } from "../../config/constants";

export default function generateKey({
    mediaId,
    path,
    filename,
}: {
    mediaId: string;
    path: PathKey; // this helps in serving both private and public files from the same CDN
    filename: string;
}): string {
    return `${PATH_PREFIX ? `${PATH_PREFIX}/` : ""}${path}/${mediaId}/${filename}`;
}
