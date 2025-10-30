import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { tempFileDirForUploads, TUS_CHUNK_SIZE } from "../config/constants";
import logger from "../services/log";
import finalizeUpload from "./finalize";
import * as preSignedUrlService from "../presigning/service";
import {
    NOT_ENOUGH_STORAGE,
    PRESIGNED_URL_INVALID,
    UNAUTHORISED,
} from "../config/strings";
import { Apikey, User } from "@medialit/models";
import { getApiKeyUsingKeyId } from "../apikey/queries";
import { getUser } from "../user/queries";
import { hasEnoughStorage } from "../media/storage-middleware";
import { createTusUpload } from "./queries";

const store = new FileStore({
    directory: `${tempFileDirForUploads}/tus-uploads`,
});

export const server = new Server({
    path: "/media/create/resumable",
    datastore: store,
    onIncomingRequest: async (req: any) => {
        try {
            const response = await getUserAndAPIKey(req);
            if (!isUser(response)) {
                throw response;
            }
            req.user = response.user;
            req.apikey = response.apikey;
        } catch (err) {
            logger.error({ err }, "Error creating tus upload record");
            throw err;
        }
    },
    onUploadCreate: async (req: any, upload: any) => {
        const metadata = upload.metadata;
        const { user, apikey } = req;

        try {
            if (!(await hasEnoughStorage(upload.size, user))) {
                throw {
                    status_code: 403,
                    body: NOT_ENOUGH_STORAGE,
                };
            }

            await createTusUpload({
                uploadId: upload.id,
                userId: user.id,
                apikey: apikey!,
                uploadLength: upload.size,
                metadata: {
                    fileName: metadata.fileName || "unknown",
                    mimeType: metadata.mimeType || "application/octet-stream",
                    accessControl: metadata.access,
                    caption: metadata.caption,
                    group: metadata.group || (req.body?.group as string),
                },
                tempFilePath: upload.id,
            });
        } catch (err: any) {
            logger.error({ err }, "Error creating tus upload record");
            throw err;
        }
        return metadata;
    },
    onUploadFinish: async (req: any, upload: any) => {
        logger.info(
            {
                uploadId: upload.id,
                offset: upload.offset,
                size: upload.size,
                metadata: upload.metadata,
            },
            "Option: Tus upload finished (onUploadFinish)",
        );

        try {
            console.time("finalize");
            await finalizeUpload(upload.id);
            console.timeEnd("finalize");
            return {};
        } catch (err: any) {
            logger.error(
                { err, uploadId: upload.id },
                "Error finalizing tus upload",
            );
            return {
                status_code: 403,
                body: err.message,
            };
        }
    },
});

async function getUserAndAPIKey(req: any): Promise<UserWithAPIKey | TusError> {
    const signature = req.headers.get("x-medialit-signature");
    const apikeyFromHeader = req.headers.get("x-medialit-apikey");
    let user, apikey;
    if (signature) {
        const response =
            await preSignedUrlService.getUserAndGroupFromPresignedUrl(
                signature as string,
            );
        if (!response) {
            return {
                status_code: 401,
                body: PRESIGNED_URL_INVALID,
            };
        }

        user = response.user;
        apikey = response.apikey;
    } else {
        const apikeyFromDB: Apikey | null =
            await getApiKeyUsingKeyId(apikeyFromHeader);
        if (!apikeyFromDB) {
            return {
                status_code: 401,
                body: UNAUTHORISED,
            };
        }
        user = await getUser(apikeyFromDB.userId.toString());
        if (!user) {
            return {
                status_code: 401,
                body: UNAUTHORISED,
            };
        }
        apikey = apikeyFromHeader;
    }

    return { user, apikey };
}

interface UserWithAPIKey {
    user: User;
    apikey: string;
}

interface TusError {
    status_code: number;
    body: string;
}

function isUser(
    response: UserWithAPIKey | TusError,
): response is UserWithAPIKey {
    return (response as UserWithAPIKey).user?.userId !== undefined;
}
