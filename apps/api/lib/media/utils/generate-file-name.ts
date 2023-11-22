import { getUniqueId } from "@medialit/utils";
import { MEDIA_ID_LENGTH } from "../../config/constants";

interface FileNameWithExtention {
    name: string;
    ext: string;
}

export default function generateFileName(
    filename: string
): FileNameWithExtention {
    const extention = filename.split(".");

    return {
        name: getUniqueId(MEDIA_ID_LENGTH),
        ext: extention[extention.length - 1],
    };
}
