import { CLOUD_PREFIX } from "../../config/constants";

export default function generateKey({
    mediaId,
    access,
    filename,
}: {
    mediaId: string;
    access: "private" | "public";
    filename: string;
}): string {
    return `${
        CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""
    }${access}/${mediaId}/${filename}`;
}
