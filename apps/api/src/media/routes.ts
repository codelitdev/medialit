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
    sealMedia,
    getMediaCount,
    getTotalSpaceOccupied,
} from "./handlers";
import signatureMiddleware from "../signature/middleware";
import storage from "./storage-middleware";
import { getSignatureFromReq } from "../signature/utils";

const router = express.Router();

router.options("/create", cors());
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
        const signature = getSignatureFromReq(req);
        if (signature) {
            signatureMiddleware(
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
router.post("/seal/:mediaId", apikey, sealMedia);
router.delete("/delete/:mediaId", apikey, deleteMedia);

export default router;
