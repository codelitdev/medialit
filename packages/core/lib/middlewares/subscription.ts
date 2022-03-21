import { SUBSCRIPTION_NOT_VALID, UNAUTHORISED } from "../config/strings";
import SubscriptionModel, { Subscription } from "../models/subscription";

function isSubscriptionValid (dateStr: Date): boolean {
    return new Date(dateStr).getTime() > new Date().getTime();
};

export async function validateSubscriptionOrRespondWithError(userId: string, res: any, next: any) {
    const subscription: Subscription | null = await SubscriptionModel.findOne({ userId });
    const hasValidSubscription = subscription && isSubscriptionValid(subscription.endsAt);
    if (!hasValidSubscription) {
        res.status(403).json({ message: SUBSCRIPTION_NOT_VALID });
        next(SUBSCRIPTION_NOT_VALID);
    }
}

export default async function subscription(req: any, res: any, next: (...args: any[]) => void) {
    if (!req.user) {
        res.status(401).json({ message: UNAUTHORISED });
    }

    await validateSubscriptionOrRespondWithError(req.user._id, res, next);
    next();
}