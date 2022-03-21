import { BAD_REQUEST, UNAUTHORISED } from "../config/strings";
import ApikeyModel, { Apikey } from "../models/apikey";
import { validateSubscriptionOrRespondWithError } from "./subscription";

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

    await validateSubscriptionOrRespondWithError(apiKey!.userId, res, next);
    next();
}