import { rm } from "node:fs/promises";
import path from "node:path";
import { User } from "@medialit/models";
import { maxStorageFor } from "../billing/entitlements";
import mediaQueries from "./queries";
import { FILE_SIZE_EXCEEDED, NOT_ENOUGH_STORAGE } from "../config/strings";
import { tempFileDirForUploads } from "../config/constants";

import getMaxFileUploadSize from "./utils/get-max-file-upload-size";

export type UploadValidationResult =
    | { valid: true }
    | {
          valid: false;
          reason: "file_size_exceeded" | "not_enough_storage";
          error: string;
          allowedFileSize?: number;
      };

export default async function storageValidation(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    if (!req.files?.file) {
        return res.status(400).json({
            error: "No file uploaded",
        });
    }

    // express-fileupload cuts a file off at its size limit and only flags it,
    // so without this check an oversized upload is stored incomplete.
    if (req.files.file.truncated) {
        await removeTempFile(req.files.file.tempFilePath);
        return res.status(400).json({
            error: `${FILE_SIZE_EXCEEDED}. Allowed: ${getMaxFileUploadSize({ user: req.user })} bytes`,
        });
    }

    const validation = await validateUploadConstraints({
        size: (req.files.file as any).size,
        user: req.user,
    });
    if (!validation.valid) {
        const status = validation.reason === "file_size_exceeded" ? 400 : 403;
        return res.status(status).json({
            error: validation.error,
        });
    }

    next();
}

export async function validateUploadConstraints({
    size,
    user,
}: {
    size: number;
    user: User & { _id: string };
}): Promise<UploadValidationResult> {
    const allowedFileSize = getMaxFileUploadSize({ user });
    if (size > allowedFileSize) {
        return {
            valid: false,
            reason: "file_size_exceeded",
            error: `${FILE_SIZE_EXCEEDED}. Allowed: ${allowedFileSize} bytes`,
            allowedFileSize,
        };
    }

    if (!(await hasEnoughStorage(size, user))) {
        return {
            valid: false,
            reason: "not_enough_storage",
            error: NOT_ENOUGH_STORAGE,
        };
    }

    return { valid: true };
}

export async function hasEnoughStorage(
    size: number,
    user: User & { _id: string },
): Promise<boolean> {
    const totalSpaceOccupied = await mediaQueries.getTotalSpace({
        userId: user._id,
    });
    const maxStorageAllowed = maxStorageFor(user);

    return totalSpaceOccupied + size <= maxStorageAllowed;
}

// Same default as express-fileupload when no temp folder is configured.
const uploadTempDir = path.resolve(
    tempFileDirForUploads || path.join(process.cwd(), "tmp"),
);

/** Deletes an upload's temp file, but never anything outside the temp folder. */
async function removeTempFile(filePath: string | undefined) {
    if (!filePath) return;
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(uploadTempDir + path.sep)) return;
    await rm(resolved, { force: true }).catch(() => undefined);
}
