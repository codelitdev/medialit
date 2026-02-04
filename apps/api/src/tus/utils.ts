import path from "path";
import { tempFileDirForUploads } from "../config/constants";
import logger from "../services/log";

export function removeTusFiles(uploadId: string) {
    try {
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
    } catch (err: any) {
        logger.error({ err }, "Error removing tus files");
    }
}
