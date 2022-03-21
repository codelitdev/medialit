import { UNAUTHORISED } from "../config/strings";
import ApikeyModel, { Apikey } from "../models/apikey";

export default async function apikey(req: any, res: any, next: (...args: any[]) => void) {
    const reqKey = req.headers['X-API_KEY'];

    if (!req.user || !reqKey) {
        res.status(401).json({ message: UNAUTHORISED });
    }

    const apiKey: Apikey | null = await ApikeyModel.findOne({ key: reqKey });
    if (!apiKey) {
        res.status(401).json({ message: UNAUTHORISED });
    }

    next();
}