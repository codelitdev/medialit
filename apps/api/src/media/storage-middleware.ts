import { maxStorageAllowedNotSubscribed } from "../config/constants";
import { maxStorageAllowedSubscribed } from "../config/constants";
import { Constants, getSubscriptionStatus } from "@medialit/models";
import mediaQueries from "./queries";

export default async function storageValidation(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    // Check for both regular uploads (file) and chunked uploads (chunk)
    const uploadedFile = req.files?.file || req.files?.chunk;
    if (!uploadedFile) {
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
        totalSpaceOccupied + (uploadedFile as any).size >
        maxStorageAllowed
    ) {
        return res.status(400).json({
            error: "You do not have enough storage space in your account to upload this file",
        });
    }

    next();
}
