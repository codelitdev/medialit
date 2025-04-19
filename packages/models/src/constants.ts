export const apikeyRestriction = ["referrer", "ipaddress", "custom"];
export const internalApikeyName = "internal-apikey";
export const SubscriptionStatus = {
    NOT_SUBSCRIBED: "not-subscribed",
    SUBSCRIBED: "subscribed",
    CANCELLED: "cancelled",
    PAUSED: "paused",
    EXPIRED: "expired",
} as const;
