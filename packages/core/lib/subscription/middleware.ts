import { SUBSCRIPTION_NOT_VALID, UNAUTHORISED } from "../config/strings";
import { validateSubscription } from "./validate-subscription";

export default async function subscription(req: any, res: any, next: (...args: any[]) => void) {
    if (!req.user) {
        return res.status(401).json({ error: UNAUTHORISED });
    }

    const subscriptionValid = await validateSubscription(req.user.id); 
    if (!subscriptionValid) {
        return res.status(403).json({ error: SUBSCRIPTION_NOT_VALID });
    }

    next();
}