import { maxStorageAllowedNotSubscribed } from "../config/constants";
import { maxStorageAllowedSubscribed } from "../config/constants";
import { getSubscriptionStatus, User } from "@medialit/models";
import mediaQueries from "./queries";
import { NOT_ENOUGH_STORAGE } from "../config/strings";
import mongoose from "mongoose";

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

    if (!(await hasEnoughStorage((req.files.file as any).size, req.user))) {
        return res.status(403).json({
            error: NOT_ENOUGH_STORAGE,
        });
    }

    next();
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
