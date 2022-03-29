import { getPlan } from "../plan/queries";
import { Subscription } from "./model";
import { getSubscription } from "./queries";

export async function validateSubscription(userId: string) {
    const subscription: Subscription | null = await getSubscription(userId);
    const validSubscription = subscription && isSubscriptionValid(subscription.endsAt);
    if (!validSubscription) { return false; }

    const plan = await getPlan(subscription!.planId.toString());
    if (!plan) { return false };

    return true;
}

function isSubscriptionValid (dateStr: Date): boolean {
    return new Date(dateStr).getTime() > new Date().getTime();
};