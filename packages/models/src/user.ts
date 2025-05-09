import type { SubscriptionStatus } from "./subscription-status";

export interface User {
    id: string;
    userId: string;
    email: string;
    active: boolean;
    name?: string;
    customerId?: string;
    subscriptionId?: string;
    subscriptionEndsAfter?: Date;
    subscriptionMethod?: "stripe" | "lemon";
    subscriptionStatus: SubscriptionStatus;
}
