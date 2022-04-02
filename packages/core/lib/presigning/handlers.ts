import logger from "../services/log";
import * as preSignedUrlService from "./service";

export async function getPresignedUrl(
    req: any,
    res: any,
    next: (...args: any[]) => void
) {
    try {
        const presignedUrl = await preSignedUrlService.generateSignedUrl({
            userId: req.user.id,
            protocol: req.protocol,
            host: req.get("Host"),
        });
        return res.status(200).json({ message: presignedUrl });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json(err.message);
    }
}
