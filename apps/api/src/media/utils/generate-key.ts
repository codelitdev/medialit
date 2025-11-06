import { CLOUD_PREFIX } from "../../config/constants";

export default function generateKey({
    mediaId,
    path,
    filename,
}: {
    mediaId: string;
    path: "tmp" | "private" | "public";
    filename: string;
}): string {
    return `${
        CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""
    }${path}/${mediaId}/${filename}`;
}
