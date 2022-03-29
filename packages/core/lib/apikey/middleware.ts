import { APIKEY_HEADER_ID } from "../config/constants";
import { BAD_REQUEST, SUBSCRIPTION_NOT_VALID, UNAUTHORISED } from "../config/strings";
import ApikeyModel, { Apikey } from "./model";
import UserModel from "../user/model";
import { validateSubscription } from "../subscription/validate-subscription";
import { getApiKeyUsingKeyId } from "./queries";
import { getUser } from "../user/queries";

export default async function apikey(req: any, res: any, next: (...args: any[]) => void) {
    const reqKey = req.headers[APIKEY_HEADER_ID];

    if (!reqKey) {
        return res.status(400).json({ error: BAD_REQUEST });
    }

    const apiKey: Apikey | null = await getApiKeyUsingKeyId(reqKey);
    if (!apiKey) {
        return res.status(401).json({ error: UNAUTHORISED });
    }

    const isSubscriptionValid = await validateSubscription(apiKey!.userId.toString());
    if (!isSubscriptionValid) {
        return res.status(403).json({ error: SUBSCRIPTION_NOT_VALID });
    }

    req.user = await getUser(apiKey!.userId.toString());

    next();
}