import { maxStorageAllowedNotSubscribed } from "../config/constants";
import { maxStorageAllowedSubscribed } from "../config/constants";
import { getSubscriptionStatus, User } from "@medialit/models";
import mediaQueries from "./queries";
import { FILE_SIZE_EXCEEDED, NOT_ENOUGH_STORAGE } from "../config/strings";
import mongoose from "mongoose";
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
    user: User & { _id: mongoose.Types.ObjectId };
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
    user: User & { _id: mongoose.Types.ObjectId },
): Promise<boolean> {
    const totalSpaceOccupied = await mediaQueries.getTotalSpace({
        userId: user._id,
    });
    const maxStorageAllowed = getSubscriptionStatus(user)
        ? maxStorageAllowedSubscribed
        : maxStorageAllowedNotSubscribed;

    return totalSpaceOccupied + size <= maxStorageAllowed;
}
