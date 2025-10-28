import express, { Request, Response } from "express";
import cors from "cors";
import apikey from "../apikey/middleware";
import presigned from "../presigning/middleware";
import { server } from "./tus-server";
import logger from "../services/log";
import { EVENTS } from "@tus/server";
import { createTusUpload, updateTusUploadOffset } from "./queries";

const router = express.Router();

const authChain = async (
    req: Request & { user?: any; apikey?: string },
    res: Response,
    next: () => void,
) => {
    // Check for signature in both query params and custom header
    const signature =
        req.query.signature ||
        req.headers["x-upload-signature"] ||
        req.headers["X-Upload-Signature"];

    try {
        if (signature) {
            // Ensure signature is properly passed to presigned middleware
            req.query.signature = signature; // presigned middleware expects it in query
            await presigned(
                req as Request & { user: any; apikey: string },
                res,
                next,
            );
        } else {
            // For direct API key usage
            await apikey(req, res, next);
        }
    } catch (error) {
        logger.error(
            { error, path: req.path, method: req.method },
            "Auth error in TUS request",
        );
        res.status(401).json({ error: "Authentication failed" });
    }
};

// Apply CORS, auth, and TUS handling for both the base endpoint and file-specific URLs
const handleTusRequest = (
    req: Request & { user?: any; apikey?: string },
    res: Response,
) => {
    if (!req.user || !req.apikey) {
        logger.error("Missing user or apikey in request");
        return res.status(401).json({ error: "Authentication required" });
    }

    if (req.method === "PATCH") {
        req.setTimeout(0); // No timeout for uploads
    }

    server.on(EVENTS.POST_CREATE, async (tusReq: any, upload: any) => {
        // Get user and apikey from request (set by middleware)
        const user = req.user;
        const apikey = req.apikey;
        // const signature = req.signature;
        // const metadata = req.tusMetadata || {};
        const metadata = upload.metadata || {};
        console.log(metadata);

        logger.info(
            {
                uploadId: upload.id,
                user,
                apikey,
                // signature,
                // metadata,
                uploadSize: upload.size,
            },
            "TUS onCreate event",
        );

        if (!user || !apikey) {
            logger.error("Missing user or apikey in tus onCreate");
            return;
        }

        createTusUpload({
            uploadId: upload.id,
            userId: user.id,
            apikey,
            uploadLength: upload.size,
            metadata: {
                fileName: metadata.fileName || "unknown",
                mimeType: metadata.mimeType || "application/octet-stream",
                accessControl: metadata.access,
                caption: metadata.caption,
                group: metadata.group || (req.body?.group as string),
            },
            // signature,
            tempFilePath: upload.id,
        }).catch((err: any) => {
            logger.error({ err }, "Error creating tus upload record");
        });
    });

    server.on(EVENTS.POST_RECEIVE, async (tusReq: any, upload: any) => {
        if (req.method === "PATCH" && upload) {
            try {
                // tus server updates the offset internally before this hook fires
                const offsetHeader = res.getHeader("Upload-Offset");
                const offset = offsetHeader
                    ? parseInt(String(offsetHeader), 10)
                    : upload.offset;
                console.log(
                    "Updating offset to:",
                    offset,
                    "for upload ID:",
                    upload.id,
                );

                await updateTusUploadOffset(upload.id, offset);

                logger.info(
                    { uploadId: upload.id, offset },
                    "Updated upload offset in DB",
                );
            } catch (err) {
                logger.error({ err }, "Failed to update tus upload offset");
            }
        }
    });

    server.handle(req, res);
};

// Handle the base TUS endpoint
// Parse raw body for PATCH requests
// router.all("/create/tus*", (req: Request, res: Response, next: () => void) => {
//     if (req.method === "PATCH") {
//         // Ensure body parsing is skipped for PATCH
//         console.log("Came here");
//         (req as any).bodyParsed = true;
//     }
//     next();
// });

router.all("/create/tus*", cors(), authChain, handleTusRequest);

export default router;
