import { maxStorageAllowedNotSubscribed } from "../config/constants";
import { maxStorageAllowedSubscribed } from "../config/constants";
import { Constants, getSubscriptionStatus } from "@medialit/models";
import mediaQueries from "./queries";

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

    const totalSpaceOccupied = await mediaQueries.getTotalSpace({
        userId: (req as any).user.id,
    });
    const maxStorageAllowed = getSubscriptionStatus(req.user)
        ? maxStorageAllowedSubscribed
        : maxStorageAllowedNotSubscribed;

    if (
        totalSpaceOccupied + (req.files?.file as any).size >
        maxStorageAllowed
    ) {
        return res.status(400).json({
            error: "You do not have enough storage space in your account to upload this file",
        });
    }

    next();
}
