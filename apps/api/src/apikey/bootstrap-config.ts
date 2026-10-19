import { hashApiKeySecret } from "./secret";

export const BOOTSTRAP_API_KEY_ENV = "MEDIALIT_BOOTSTRAP_API_KEY";

/** At least 43 URL-safe characters: 256 bits if base64url, ~172 if hex.
 * `ml_live_$(openssl rand -hex 32)` fits. Only the shape can be checked. */
const BOOTSTRAP_KEY_PATTERN = /^[A-Za-z0-9_-]{43,}$/;

export type BootstrapKeyConfig =
    | { status: "unset" }
    | { status: "invalid" }
    | { status: "set"; secret: string; keyHash: string };

export function readBootstrapKeyConfig(
    env: NodeJS.ProcessEnv = process.env,
): BootstrapKeyConfig {
    const secret = env[BOOTSTRAP_API_KEY_ENV]?.trim();
    if (!secret) return { status: "unset" };
    if (!BOOTSTRAP_KEY_PATTERN.test(secret)) return { status: "invalid" };
    return { status: "set", secret, keyHash: hashApiKeySecret(secret) };
}

/** The hash of the configured bootstrap key, if any. That key is managed by
 * configuration: it can't be revoked while it is set. */
export function configuredBootstrapKeyHash(
    env: NodeJS.ProcessEnv = process.env,
): string | null {
    const config = readBootstrapKeyConfig(env);
    return config.status === "set" ? config.keyHash : null;
}
