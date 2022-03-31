import getUniqueId from "../../utils/unique-id";

interface FileNameWithExtention {
    name: string;
    ext: string;
}

export default function generateFileName(
    filename: string
): FileNameWithExtention {
    const extention = filename.split(".");

    return {
        name: getUniqueId(),
        ext: extention[extention.length - 1],
    };
}
