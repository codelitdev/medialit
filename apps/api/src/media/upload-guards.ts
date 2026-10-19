import type { NextFunction, Request, Response } from "express";
import fileUpload from "express-fileupload";
import {
    maxFileUploadSizeSubscribed,
    tempFileDirForUploads,
} from "../config/constants";
import { maxUploadFor } from "../billing/entitlements";
import apikey from "../apikey/middleware";
import signatureMiddleware from "../signature/middleware";
import { getSignatureFromReq } from "../signature/utils";
import { DATA_WRITE_SCOPE } from "../auth/options";
import { requireScope } from "../auth/scopes";
import { validateUploadConstraints } from "./storage-middleware";

/**
 * Authenticates an upload from its headers and query string alone: a
 * signature (`?signature=` or `x-medialit-signature`), otherwise the
 * `x-medialit-apikey` header or a Bearer token. Runs before the body is read,
 * so an unauthenticated upload is rejected without touching the disk.
 */
export function authenticateUpload(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (getSignatureFromReq(req)) {
        void signatureMiddleware(req as any, res, next);
        return;
    }
    void apikey(req, res, () => requireScope(DATA_WRITE_SCOPE)(req, res, next));
}

/** `Content-Length` covers the whole multipart body; allow this much for the
 * boundaries, part headers and form fields around the file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Rejects an upload whose declared size can't fit the caller's plan or
 * remaining storage, before any of it is read. Uploads without a
 * `Content-Length` are still capped by the parser and re-checked after it.
 */
export async function preflightUploadSize(
    req: any,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const declared = Number(req.headers["content-length"]);
    if (!Number.isFinite(declared) || declared <= 0) {
        next();
        return;
    }
    const validation = await validateUploadConstraints({
        size: Math.max(0, declared - MULTIPART_OVERHEAD_BYTES),
        user: req.user,
    });
    if (!validation.valid) {
        const status = validation.reason === "file_size_exceeded" ? 400 : 403;
        res.status(status).json({ error: validation.error });
        return;
    }
    next();
}

/** Parses the upload with the caller's plan limit, never above the global
 * `MAX_UPLOAD_SIZE_SUBSCRIBED` cap. */
export async function parseUpload(
    req: any,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const planLimit = await maxUploadFor({ id: req.user._id ?? req.user.id });
    fileUpload({
        useTempFiles: true,
        tempFileDir: tempFileDirForUploads,
        limits: {
            fileSize: Math.min(planLimit, maxFileUploadSizeSubscribed),
            files: 1,
        },
    })(req, res, next);
}
