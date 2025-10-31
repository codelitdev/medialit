import { Request, Response } from "express";
import { PRESIGNED_URL_INVALID } from "../config/strings";
import * as preSignedUrlService from "./service";
import { getSignatureFromReq } from "./utils";

export default async function signature(
    req: Request & { user?: any; apikey?: string },
    res: Response,
    next: (...args: any[]) => void,
) {
    const signature = getSignatureFromReq(req);

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
