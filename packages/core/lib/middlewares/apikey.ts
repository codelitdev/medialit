import { BAD_REQUEST, SUBSCRIPTION_NOT_VALID, UNAUTHORISED } from "../config/strings";
import ApikeyModel, { Apikey } from "../models/apikey";
import { hasValidSubscription } from "./subscription";

export default async function apikey(req: any, res: any, next: (...args: any[]) => void) {
    const reqKey = req.headers['X-API_KEY'];

    if (!reqKey) {
        res.status(400).json({ message: BAD_REQUEST });
        next(BAD_REQUEST);
    }

    const apiKey: Apikey | null = await ApikeyModel.findOne({ key: reqKey });
    if (!apiKey) {
        res.status(401).json({ message: UNAUTHORISED });
        next(UNAUTHORISED);
    }

    const isSubscriptionValid = await hasValidSubscription(apiKey!.userId);
    if (!isSubscriptionValid) {
        res.status(403).json({ message: SUBSCRIPTION_NOT_VALID });
        next(SUBSCRIPTION_NOT_VALID);
    }

    next();
}