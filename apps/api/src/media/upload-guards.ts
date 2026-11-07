import type { NextFunction, Request, Response } from "express";
import apikey from "../apikey/middleware";
import signatureMiddleware from "../signature/middleware";
import { getSignatureFromReq } from "../signature/utils";
import { DATA_WRITE_SCOPE } from "../auth/options";
import { requireScope } from "../auth/scopes";
import { validateUploadConstraints } from "./storage-middleware";
import { TOO_MANY_UPLOADS } from "../config/strings";

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
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

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

/**
 * Caps the form-data uploads this process streams at once. Each holds parts
 * in memory, so an unbounded number can exhaust it and take every running
 * upload down. Over the cap, answers 503 with Retry-After so clients back
 * off and retry.
 */
export function limitConcurrentUploads(max: number) {
    let active = 0;
    const middleware = (req: Request, res: Response, next: NextFunction) => {
        if (active >= max) {
            res.setHeader("Retry-After", "10");
            res.status(503).json({ error: TOO_MANY_UPLOADS });
            return;
        }
        active++;
        let released = false;
        res.on("close", () => {
            if (released) return;
            released = true;
            active--;
        });
        next();
    };
    middleware.activeCount = () => active;
    return middleware;
}
