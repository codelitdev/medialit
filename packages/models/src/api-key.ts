/** An app as the dashboard sees it. `appId` is the public ID. */
export interface App {
    appId: string;
    name: string;
    default: boolean;
}

/** An API key as the dashboard sees it. The secret is never part of it; it is
 * returned once, when the key is created. `keyId` is the public ID. */
export interface ApiKey {
    keyId: string;
    name: string;
    /** The first characters of the key, e.g. `ml_live_a1b2`. */
    keyPrefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    /** True for the key set by `MEDIALIT_BOOTSTRAP_API_KEY`, which can't be
     * revoked while it is configured. */
    managedByConfiguration: boolean;
}
