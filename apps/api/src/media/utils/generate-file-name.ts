import { getUniqueId } from "@medialit/utils";
import { MEDIA_ID_LENGTH } from "../../config/constants";

interface FileNameWithExtention {
    name: string;
    ext: string;
}

export default function generateFileName(
    filename: string,
): FileNameWithExtention {
    const extention = filename.split(".");
    const ext = extention[extention.length - 1];

    return {
        name: getUniqueId(MEDIA_ID_LENGTH),
        // Extension ends up in file paths and S3 keys; never trust it raw.
        ext:
            extention.length > 1 && /^[A-Za-z0-9]{1,10}$/.test(ext)
                ? ext
                : "bin",
    };
}
