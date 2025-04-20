import express, { Request, Response } from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import {
    tempFileDirForUploads,
    maxFileUploadSizeSubscribed,
} from "../config/constants";
import apikey from "../apikey/middleware";
import {
    getMedia,
    getMediaDetails,
    uploadMedia,
    deleteMedia,
    getMediaCount,
    getTotalSpaceOccupied,
} from "./handlers";
import presigned from "../presigning/middleware";
import storage from "./storage-middleware";

const router = express.Router();

router.post(
    "/create",
    cors(),
    fileUpload({
        useTempFiles: true,
        tempFileDir: tempFileDirForUploads,
        limits: {
            fileSize: maxFileUploadSizeSubscribed,
            files: 1,
        },
    }),
    (req: Request, res: Response, next: (...args: any[]) => void) => {
        const { signature } = req.query;
        if (signature) {
            presigned(
                req as Request & { user: any; apikey: string },
                res,
                next,
            );
        } else {
            apikey(req, res, next);
        }
    },
    storage,
    uploadMedia,
);
router.post("/get/count", apikey, getMediaCount);
router.post("/get/size", apikey, getTotalSpaceOccupied);
router.post("/get/:mediaId", apikey, getMediaDetails);
router.post("/get", apikey, getMedia);
router.delete("/delete/:mediaId", apikey, deleteMedia);

export default router;
