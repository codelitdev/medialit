import {
    BAD_REQUEST,
    SUBSCRIPTION_NOT_VALID,
    UNAUTHORISED,
} from "../config/strings";
import { getApiKeyUsingKeyId } from "./queries";
import { getUser } from "../user/queries";
import { Apikey } from "@medialit/models";

export default async function apikey(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const reqKey = req.body.apikey;

    if (!reqKey) {
        console.log("API key missing in request");
        return res.status(400).json({ error: BAD_REQUEST });
    }

    const apiKey: Apikey | null = await getApiKeyUsingKeyId(reqKey);
    if (!apiKey) {
        return res.status(401).json({ error: UNAUTHORISED });
    }

    // const isSubscriptionValid = await validateSubscription(
    //     apiKey!.userId.toString(),
    // );
    // if (!isSubscriptionValid) {
    //     return res.status(403).json({ error: SUBSCRIPTION_NOT_VALID });
    // }

    req.user = await getUser(apiKey!.userId.toString());
    req.apikey = apiKey.key;

    next();
}
