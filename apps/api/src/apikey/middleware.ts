import { BAD_REQUEST, UNAUTHORISED } from "../config/strings";
import { getApiKeyUsingKeyId } from "./queries";
import { getUser } from "../user/queries";
import { Apikey } from "@medialit/models";
import logger from "../services/log";

export default async function apikey(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const reqKey = req.body?.apikey || req.headers["x-medialit-apikey"];

    if (!reqKey) {
        logger.error({}, "API key is missing");
        return res.status(400).json({ error: BAD_REQUEST });
    }

    const apiKey: Apikey | null = await getApiKeyUsingKeyId(reqKey);
    if (!apiKey) {
        return res.status(401).json({ error: UNAUTHORISED });
    }

    req.user = await getUser(apiKey!.userId.toString());
    req.apikey = apiKey.key;

    next();
}
