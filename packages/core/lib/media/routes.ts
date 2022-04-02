import express, { Request, Response } from "express";
import fileUpload from "express-fileupload";
import { tempFileDirForUploads } from "../config/constants";
import apikey from "../apikey/middleware";
import {
    getMedia,
    getMediaDetails,
    uploadMedia,
    deleteMedia,
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
    (req: Request, res: Response, next: (...args: any[]) => void) => {
        const { signature } = req.query;
        if (signature) {
            presigned(req, res, next);
        } else {
            apikey(req, res, next);
        }
    },
    uploadMedia
);
router.post("/get/:mediaId", apikey, getMediaDetails);
router.post("/get", apikey, getMedia);
router.delete("/delete/:mediaId", apikey, deleteMedia);

export default router;
