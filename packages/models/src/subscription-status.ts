import { Constants } from ".";

export type SubscriptionStatus =
    (typeof Constants.SubscriptionStatus)[keyof typeof Constants.SubscriptionStatus];
