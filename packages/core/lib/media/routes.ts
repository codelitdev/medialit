import express from "express";
import fileUpload from "express-fileupload";
import { tempFileDirForUploads } from "../config/constants";
import apikey from "../apikey/middleware";
import {
    getMedia,
    getMediaDetails,
    uploadMedia,
    deleteMedia,
} from "./handlers";

const router = express.Router();

router.use(
    fileUpload({
        useTempFiles: true,
        tempFileDir: tempFileDirForUploads,
    })
);

router.post("/create", apikey, uploadMedia);
router.post("/get/:mediaId", apikey, getMediaDetails);
router.post("/get", apikey, getMedia);
router.delete("/delete/:mediaId", apikey, deleteMedia);

export default router;
