import { PATH_PREFIX } from "../../config/constants";

export const PATH_KEY = {
    PRIVATE: "i",
    PUBLIC: "p",
} as const;

type PathKey = (typeof PATH_KEY)[keyof typeof PATH_KEY];

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
