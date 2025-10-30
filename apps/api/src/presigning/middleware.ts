import { Request, Response } from "express";
import { PRESIGNED_URL_INVALID } from "../config/strings";
import * as preSignedUrlService from "./service";

export default async function presigned(
    req: Request & { user?: any; apikey?: string },
    res: Response,
    next: (...args: any[]) => void,
) {
    const signature =
        req.query.signature || req.headers["x-medialit-signature"];

    const response = await preSignedUrlService.getUserAndGroupFromPresignedUrl(
        signature as string,
    );
    if (!response) {
        return res.status(404).json({ error: PRESIGNED_URL_INVALID });
    }

    const { user, apikey, group } = response;

    req.user = user;
    req.apikey = apikey;
    if (group) {
        req.body.group = group;
    }

    next();
}
