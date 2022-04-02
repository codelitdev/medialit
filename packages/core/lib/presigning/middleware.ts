import { Request, Response } from "express";
import { PRESIGNED_URL_INVALID } from "../config/strings";
import * as preSignedUrlService from "./service";

export default async function presigned(
    req: Request,
    res: Response,
    next: (...args: any[]) => void
) {
    const { signature } = req.query;

    const user = await preSignedUrlService.getUserFromPresignedUrl(
        signature as string
    );
    if (!user) {
        return res.status(404).json({ error: PRESIGNED_URL_INVALID });
    }

    req.user = user;

    next();
}
