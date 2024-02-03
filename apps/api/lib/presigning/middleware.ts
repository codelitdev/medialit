import { Request, Response } from "express";
import { PRESIGNED_URL_INVALID } from "../config/strings";
import * as preSignedUrlService from "./service";

export default async function presigned(
    req: Request,
    res: Response,
    next: (...args: any[]) => void
) {
    const { signature } = req.query;

    const response = await preSignedUrlService.getUserAndGroupFromPresignedUrl(
        signature as string
    );
    if (!response) {
        return res.status(404).json({ error: PRESIGNED_URL_INVALID });
    }

    const { user, group } = response;

    req.user = user;
    if (group) {
        req.body.group = group;
    }

    next();
}
