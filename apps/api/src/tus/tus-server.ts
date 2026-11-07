import { Server } from "@tus/server";
import { S3Store } from "@tus/s3-store";
import {
    cloudBucket,
    cloudRegion,
    DISABLE_TAGGING,
    maxFileUploadSizeSubscribed,
    SIGNATURE_VALIDITY_MINUTES,
    UPLOAD_PART_CONCURRENCY,
    UPLOAD_PART_SIZE_BYTES,
} from "../config/constants";
import logger from "../services/log";
import { getPrivateS3ClientConfig } from "../services/s3";
import finalizeUpload from "./finalize";
import * as preSignedUrlService from "../signature/service";
import { PRESIGNED_URL_INVALID, UNAUTHORISED } from "../config/strings";
import { User } from "@medialit/models";
import { resolveAuth } from "../auth/resolve-auth";
import { DATA_WRITE_SCOPE } from "../auth/options";
import {
    API_KEY_SCOPES,
    hasScope,
    insufficientScopeMessage,
} from "../auth/scopes";
import { validateUploadConstraints } from "../media/storage-middleware";
import { newUploadTarget, parseUploadKey, startUpload } from "../media/ingest";
import { createTusUpload } from "./queries";
import mediaService from "../media/service";

/**
 * Streams tus uploads into S3 multipart uploads. Each upload ID is the
 * object's final key, so nothing is copied once it finishes. tus keeps its
 * own resume bookkeeping in a `{key}.info` object next to the file.
 */
export const store = new S3Store({
    partSize: UPLOAD_PART_SIZE_BYTES,
    // Every part but the last has the same size, which R2 requires.
    minPartSize: UPLOAD_PART_SIZE_BYTES,
    maxConcurrentPartUploads: UPLOAD_PART_CONCURRENCY,
    useTags: !DISABLE_TAGGING,
    expirationPeriodInMilliseconds: SIGNATURE_VALIDITY_MINUTES * 60 * 1000,
    s3ClientConfig: {
        ...getPrivateS3ClientConfig(),
        // The client is built at import, unlike the lazy one in services/s3;
        // without a region it would throw before any upload is attempted.
        region: cloudRegion || "us-east-1",
        bucket: cloudBucket,
    },
});

/** Upload IDs are keys with slashes, so URLs carry them base64url-encoded. */
export function encodeUploadId(id: string): string {
    return Buffer.from(id).toString("base64url");
}

export function decodeUploadId(segment: string): string | undefined {
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) return undefined;
    const id = Buffer.from(segment, "base64url").toString("utf8");
    return parseUploadKey(id) ? id : undefined;
}

export const server = new Server({
    path: "/media/create/resumable",
    datastore: store,
    respectForwardedHeaders: true,
    exposedHeaders: ["media"],
    // A hard cap; the caller's plan limit is checked in onUploadCreate.
    maxSize: maxFileUploadSizeSubscribed,
    namingFunction: (_req, metadata) =>
        newUploadTarget(metadata?.fileName || "file").key,
    generateUrl: (_req, { proto, host, path, id }) =>
        `${proto}://${host}${path}/${encodeUploadId(id)}`,
    getFileIdFromRequest: (_req, lastPath) =>
        lastPath ? decodeUploadId(lastPath) : undefined,
    onIncomingRequest: async (req: any) => {
        try {
            const response = await getUploadAuth(req);
            if (!isUser(response)) {
                throw response;
            }
            req.user = response.user;
            req.appId = response.appId;
            req.group = response.group;
            req.signature = response.signature;
        } catch (err) {
            logger.error({ err }, "Error validating user creds");
            throw err;
        }
    },
    onUploadCreate: handleTusUploadCreate,
    onUploadFinish: async (req: any, upload: any) => {
        try {
            const mediaId = await finalizeUpload(upload.id);
            const media = await mediaService.getMediaDetails({
                userId: req.user._id,
                appId: req.appId,
                mediaId,
            });
            return {
                headers: {
                    media: JSON.stringify(media),
                },
            };
        } catch (err: any) {
            logger.error(
                { err, uploadId: upload.id },
                "Error finalizing tus upload",
            );
            throw {
                status_code: 403,
                body: err.message,
            };
        }
    },
});

/**
 * The group bound to the upload signature always wins over the one the
 * client sends, so apps can trust it to say who an upload belongs to.
 */
export function uploadGroup(
    signatureGroup: string | null | undefined,
    clientGroup: string | undefined,
): string | undefined {
    return signatureGroup ?? clientGroup;
}

export async function handleTusUploadCreate(req: any, upload: any) {
    const metadata = upload.metadata || {};
    const { user, appId, group } = req;

    // Every upload declares its size, so it can be checked before any bytes
    // arrive.
    if (upload.sizeIsDeferred || typeof upload.size !== "number") {
        throw {
            status_code: 400,
            body: "Upload-Length is required",
        };
    }

    const target = parseUploadKey(upload.id);
    if (!target) {
        throw { status_code: 500, body: "Invalid upload key" };
    }

    try {
        const validation = await validateUploadConstraints({
            size: upload.size,
            user,
        });
        if (!validation.valid) {
            throw {
                status_code: 403,
                body: validation.error,
            };
        }

        const mimeType = metadata.mimeType || "application/octet-stream";
        await createTusUpload({
            uploadId: upload.id,
            mediaId: target.mediaId,
            userId: user.id,
            appId: appId!,
            uploadLength: upload.size,
            metadata: {
                fileName: metadata.fileName || "unknown",
                mimeType,
                accessControl: metadata.access,
                caption: metadata.caption,
                group: uploadGroup(group, metadata.group),
            },
            signature: req.signature,
        });
        await startUpload(target, {
            userId: user.id,
            appId: appId!,
            originalFileName: metadata.fileName || "unknown",
            mimeType,
            declaredSize: upload.size,
        });
        // The S3 store sets the object's Content-Type from this.
        return { metadata: { ...metadata, contentType: mimeType } };
    } catch (err: any) {
        logger.error({ err }, "Error creating tus upload record");
        throw err;
    }
}

/**
 * Authenticates every TUS request: a signature, otherwise the same API key or
 * Bearer token resolution as the REST API, so revoked keys, deleted apps and
 * deactivated accounts are rejected here too.
 */
async function getUploadAuth(req: any): Promise<UploadAuth | TusError> {
    const signature = req.headers.get("x-medialit-signature");
    if (signature) {
        const response =
            await preSignedUrlService.getUserAndGroupFromPresignedUrl(
                signature as string,
            );
        if (response.status === "account_inactive") {
            return { status_code: 403, body: "This account is deactivated" };
        }
        if (response.status !== "ok") {
            return {
                status_code: 401,
                body: PRESIGNED_URL_INVALID,
            };
        }
        return {
            user: response.user,
            appId: response.appId,
            group: response.group,
            signature: signature as string,
        };
    }

    const auth = await resolveAuth({
        authorization: req.headers.get("authorization") ?? undefined,
        apiKeyHeader: req.headers.get("x-medialit-apikey") ?? undefined,
    });
    if (auth.status === "forbidden") {
        return { status_code: 403, body: "This account is deactivated" };
    }
    if (auth.status !== "authenticated" || !auth.appId) {
        return { status_code: 401, body: UNAUTHORISED };
    }
    const scopes = auth.kind === "oauth" ? auth.scopes : API_KEY_SCOPES;
    if (!hasScope(scopes, DATA_WRITE_SCOPE)) {
        return {
            status_code: 403,
            body: insufficientScopeMessage(DATA_WRITE_SCOPE),
        };
    }
    return { user: auth.user, appId: auth.appId };
}

interface UploadAuth {
    user: User;
    /** Internal app ID. */
    appId: string;
    group?: string;
    signature?: string;
}

interface TusError {
    status_code: number;
    body: string;
}

function isUser(response: UploadAuth | TusError): response is UploadAuth {
    return (response as UploadAuth).user?.userId !== undefined;
}
