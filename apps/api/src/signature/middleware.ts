import { Request, Response } from "express";
import { PRESIGNED_URL_INVALID } from "../config/strings";
import * as preSignedUrlService from "./service";
import { getSignatureFromReq } from "./utils";

/**
 * Authenticates a request by its signature (`?signature=` or the
 * `x-medialit-signature` header). Reads nothing from the body, so it can run
 * before an upload is parsed. The signature's group is put on `req.group`.
 */
export default async function signature(
    req: Request & { user?: any; appId?: string; group?: string },
    res: Response,
    next: (...args: any[]) => void,
) {
    const signature = getSignatureFromReq(req);

    const response = await preSignedUrlService.getUserAndGroupFromPresignedUrl(
        signature as string,
    );
    if (response.status === "account_inactive") {
        return res.status(403).json({
            error: "account_inactive",
            error_description: "This account is deactivated",
        });
    }
    if (response.status !== "ok") {
        return res.status(404).json({ error: PRESIGNED_URL_INVALID });
    }

    req.user = response.user;
    req.appId = response.appId;
    if (response.group) {
        req.group = response.group;
    }

    next();
}
