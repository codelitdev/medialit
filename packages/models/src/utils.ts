import { SubscriptionStatus } from "./constants";
import { User } from "./user";

export function getSubscriptionStatus(user: User): boolean {
    if (user.subscriptionStatus === SubscriptionStatus.NOT_SUBSCRIBED) {
        return false;
    }

    if (user.subscriptionEndsAfter && user.subscriptionEndsAfter < new Date()) {
        return false;
    }

    return true;
}
