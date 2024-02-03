import express, { Request, Response } from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import { tempFileDirForUploads } from "../config/constants";
import apikey from "../apikey/middleware";
import {
    getMedia,
    getMediaDetails,
    uploadMedia,
    deleteMedia,
    getMediaCount,
} from "./handlers";
import presigned from "../presigning/middleware";

const router = express.Router();

router.use(
    fileUpload({
        useTempFiles: true,
        tempFileDir: tempFileDirForUploads,
    })
);

router.post(
    "/create",
    cors(),
    (req: Request, res: Response, next: (...args: any[]) => void) => {
        const { signature } = req.query;
        if (signature) {
            presigned(
                req as Request & { user: any; apikey: string },
                res,
                next
            );
        } else {
            apikey(req, res, next);
        }
    },
    uploadMedia
);
router.post("/get/count", apikey, getMediaCount);
router.post("/get/:mediaId", apikey, getMediaDetails);
router.post("/get", apikey, getMedia);
router.delete("/delete/:mediaId", apikey, deleteMedia);

export default router;
