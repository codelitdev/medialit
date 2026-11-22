import { parseTrustProxy } from "@codelitdev/oauth-server-kit/express";

/**
 * Express's `trust proxy` setting. `TRUST_PROXY` takes a hop count, `true`,
 * `false`, or addresses and subnets (see `parseTrustProxy`). Without it,
 * `ENABLE_TRUST_PROXY=true` still trusts one hop, and nothing is trusted
 * otherwise, as before `TRUST_PROXY` existed.
 */
export function trustProxySetting(
    env: Record<string, string | undefined>,
): boolean | number | string {
    if (env.TRUST_PROXY?.trim()) return parseTrustProxy(env.TRUST_PROXY);
    return env.ENABLE_TRUST_PROXY === "true" ? 1 : false;
}
