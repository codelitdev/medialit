import { CLOUD_PREFIX } from "../../config/constants";

// interface GenerateKeyProps {
//     mediaId: string;
//     type: "main" | "thumb";
//     extension?: string;
// }

// export default function generateKey({
//     mediaId,
//     type,
//     extension,
// }: GenerateKeyProps): string {
//     return `${CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""}${mediaId}/${type}.${
//         type === "thumb" ? "webp" : extension
//     }`;
// }

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
