import {
    BAD_REQUEST,
    SUBSCRIPTION_NOT_VALID,
    UNAUTHORISED,
} from "../config/strings";
import { validateSubscription } from "../subscription/validate-subscription";
import { getApiKeyUsingKeyId } from "./queries";
import { getUser } from "../user/queries";
import { Apikey } from "@medialit/models";
import queries from "../../src/apikey/queries";

export default async function apikey(
    req: any,
    res: any,
    next: (...args: any[]) => void
) {
    const reqKey = req.body.apikey;
    // console.log("reqKey",reqKey);

    if (!reqKey) {
        return res.status(400).json({ error: BAD_REQUEST });
    }

    const apiKey: Apikey | null = await queries.getApiKeyUsingKeyId(reqKey);
    // console.log("req.body.apiKey", apiKey)

    if (!apiKey) {
        return res.status(401).json({ error: UNAUTHORISED });
    }

    // console.log("req.body.internalKey", req.body.internalKey)
    if (req.body.internalKey) {
        const internalApikey: Apikey | null = await queries.getApiKeyUsingKeyId(
            req.body.internalKey
        );
        if (!internalApikey) {
            // console.log("internalApikey", internalApikey)
            return res.status(401).json({ error: UNAUTHORISED });
        }
    }

    const isSubscriptionValid = await validateSubscription(
        apiKey!.userId.toString()
    );
    if (!isSubscriptionValid) {
        return res.status(403).json({ error: SUBSCRIPTION_NOT_VALID });
    }
    3;

    req.user = await getUser(apiKey!.userId.toString());
    req.apikey = apiKey.key;

    next();
}
