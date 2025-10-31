import path from "path";
import { tempFileDirForUploads } from "../config/constants";

export function removeTusFiles(uploadId: string) {
    const tusFilePath = path.join(
        `${tempFileDirForUploads}/tus-uploads`,
        uploadId,
    );
    require("fs").unlinkSync(tusFilePath);
    const tusJSONFilePath = path.join(
        `${tempFileDirForUploads}/tus-uploads`,
        `${uploadId}.json`,
    );
    require("fs").unlinkSync(tusJSONFilePath);
}
