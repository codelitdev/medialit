export const apikeyRestriction = ["referrer", "ipaddress", "custom"];
export const SubscriptionStatus = {
    NOT_SUBSCRIBED: "not-subscribed",
    SUBSCRIBED: "subscribed",
    CANCELLED: "cancelled",
    PAUSED: "paused",
    EXPIRED: "expired",
} as const;
export const AccessControl = {
    PRIVATE: "private",
    PUBLIC: "public",
} as const;
