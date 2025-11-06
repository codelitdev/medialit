import { PATH_PREFIX } from "../../config/constants";

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
        PATH_PREFIX ? `${PATH_PREFIX}/` : ""
    }${path}/${mediaId}/${filename}`;
}
