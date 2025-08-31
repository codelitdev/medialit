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
    initializeChunkedUpload,
    uploadChunk,
    completeChunkedUpload,
    abortChunkedUpload,
} from "./handlers";
import presigned from "../presigning/middleware";
import storage from "./storage-middleware";

const router = express.Router();

// Enable CORS for all routes with fully permissive settings
router.use(cors({
    origin: "*",
    methods: "*",
    allowedHeaders: "*",
    credentials: false
}));

router.post(
    "/create",
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

// Chunked upload routes
router.post(
    "/chunked/init",
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
    initializeChunkedUpload,
);

router.post(
    "/chunked/upload/:uploadId",
    fileUpload({
        useTempFiles: true,
        tempFileDir: tempFileDirForUploads,
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB per chunk
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
    uploadChunk,
);

router.post(
    "/chunked/complete/:uploadId",
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
    completeChunkedUpload,
);

router.delete(
    "/chunked/abort/:uploadId",
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
    abortChunkedUpload,
);

router.post("/get/count", apikey, getMediaCount);
router.post("/get/size", apikey, getTotalSpaceOccupied);
router.post("/get/:mediaId", apikey, getMediaDetails);
router.post("/get", apikey, getMedia);
router.delete("/delete/:mediaId", apikey, deleteMedia);

export default router;
