import { maxFileUploadSize } from "../../config/constants";
import { FILE_IS_REQUIRED, FILE_SIZE_EXCEEDED } from "../../config/strings";

export function uploadMedia(req: any, res: any, next: (...args: any[]) => void) {
    req.socket.setTimeout(10 * 60 * 1000);
  
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: FILE_IS_REQUIRED });
    }
  
    if (req.files.file.size > maxFileUploadSize) {
      return res.status(400).json({ error: FILE_SIZE_EXCEEDED });
    }
}

export function getMedia(req: any, res: any, next: (...args: any[]) => void) {
    res.status(200).json(req.user);
}