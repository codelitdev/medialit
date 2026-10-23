import { EVENTS, Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { tempFileDirForUploads } from "../config/constants";
import logger from "../services/log";
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
import { createTusUpload, updateTusUploadOffset } from "./queries";
import mediaService from "../media/service";

const store = new FileStore({
    directory: `${tempFileDirForUploads}/tus-uploads`,
});

export const server = new Server({
    path: "/media/create/resumable",
    datastore: store,
    respectForwardedHeaders: true,
    exposedHeaders: ["media"],
    onIncomingRequest: async (req: any) => {
        try {
            const response = await getUploadAuth(req);
            if (!isUser(response)) {
                throw response;
            }
            req.user = response.user;
            req.appId = response.appId;
            req.group = response.group;
        } catch (err) {
            logger.error({ err }, "Error validating user creds");
            throw err;
        }
    },
    onUploadCreate: handleTusUploadCreate,
    onUploadFinish: async (req: any, upload: any) => {
        try {
            console.time("finalize");
            const mediaId = await finalizeUpload(upload.id);
            console.timeEnd("finalize");
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
    const metadata = upload.metadata;
    const { user, appId, group } = req;

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

        await createTusUpload({
            uploadId: upload.id,
            userId: user.id,
            appId: appId!,
            uploadLength: upload.size,
            metadata: {
                fileName: metadata.fileName || "unknown",
                mimeType: metadata.mimeType || "application/octet-stream",
                accessControl: metadata.access,
                caption: metadata.caption,
                group: uploadGroup(group, metadata.group),
            },
            tempFilePath: upload.id,
        });
    } catch (err: any) {
        logger.error({ err }, "Error creating tus upload record");
        throw err;
    }
    return metadata;
}

server.on(EVENTS.POST_RECEIVE, async (req: any, upload: any) => {
    try {
        await updateTusUploadOffset(upload.id, upload.offset);
    } catch (err) {
        logger.error({ err }, "Failed to update tus upload offset");
    }
});

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
}

interface TusError {
    status_code: number;
    body: string;
}

function isUser(response: UploadAuth | TusError): response is UploadAuth {
    return (response as UploadAuth).user?.userId !== undefined;
}
