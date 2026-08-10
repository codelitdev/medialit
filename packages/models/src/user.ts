import type { SubscriptionStatus } from "./subscription-status";

export interface User {
    id: string;
    userId: string;
    email: string;
    active: boolean;
    name?: string | null;
    customerId?: string | null;
    subscriptionId?: string | null;
    subscriptionEndsAfter?: Date | null;
    subscriptionMethod?: "stripe" | "lemon" | null;
    subscriptionStatus: SubscriptionStatus;
}
