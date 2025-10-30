import express, { Request, Response } from "express";
import cors from "cors";
import apikey from "../apikey/middleware";
import presigned from "../presigning/middleware";
import { server } from "./tus-server";
import logger from "../services/log";
import { EVENTS } from "@tus/server";
import { createTusUpload, updateTusUploadOffset } from "./queries";
import { hasEnoughStorage } from "../media/storage-middleware";
import { NOT_ENOUGH_STORAGE } from "../config/strings";

const router = express.Router();

const authChain = async (
    req: Request & { user?: any; apikey?: string },
    res: Response,
    next: () => void,
) => {
    const signature =
        req.query.signature || req.headers["x-medialit-signature"];

    if (signature) {
        presigned(req, res, next);
    } else {
        apikey(req, res, next);
    }
};

const handleTusRequest = (
    req: Request & { user?: any; apikey?: string },
    res: Response,
) => {
    console.log("HandleTusRequest", req.method);
    if (req.method === "PATCH") {
        req.setTimeout(0); // No timeout for uploads
    }

    server.on(EVENTS.POST_RECEIVE, async (_: any, upload: any) => {
        if (req.method === "PATCH" && upload) {
            try {
                await updateTusUploadOffset(upload.id, upload.offset);
            } catch (err) {
                logger.error({ err }, "Failed to update tus upload offset");
            }
        }
    });

    server.handle(req as any, res);
};

router.all("/create/resumable{*splat}", cors(), handleTusRequest);

export default router;
