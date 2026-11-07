import { User } from "@medialit/models";
import {
    resolveAccountPlan,
    storageLimitFor,
    uploadLimitFor,
} from "../billing/entitlements";
import mediaQueries from "./queries";
import { FILE_SIZE_EXCEEDED, NOT_ENOUGH_STORAGE } from "../config/strings";

type UploadUser = User & { _id: string };

function planUser(user: UploadUser) {
    return { id: user._id };
}

export type UploadValidationResult =
    | { valid: true }
    | {
          valid: false;
          reason: "file_size_exceeded" | "not_enough_storage";
          error: string;
          allowedFileSize?: number;
      };

export async function validateUploadConstraints({
    size,
    user,
}: {
    size: number;
    user: UploadUser;
}): Promise<UploadValidationResult> {
    const plan = await resolveAccountPlan(planUser(user));
    const allowedFileSize = uploadLimitFor(plan);
    if (size > allowedFileSize) {
        return {
            valid: false,
            reason: "file_size_exceeded",
            error: `${FILE_SIZE_EXCEEDED}. Allowed: ${allowedFileSize} bytes`,
            allowedFileSize,
        };
    }

    if (!(await hasEnoughStorage(size, user, storageLimitFor(plan)))) {
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
    user: UploadUser,
    /** Pass when the caller already resolved the plan. */
    storageLimit?: number,
): Promise<boolean> {
    const totalSpaceOccupied = await mediaQueries.getTotalSpace({
        userId: user._id,
    });
    const maxStorageAllowed =
        storageLimit ??
        storageLimitFor(await resolveAccountPlan(planUser(user)));

    return totalSpaceOccupied + size <= maxStorageAllowed;
}
