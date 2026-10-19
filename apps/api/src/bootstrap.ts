import {
    ensureProfile,
    findUserByEmail,
    insertAuthUser,
    listApps,
    syncBootstrapApiKey,
    type BootstrapKeyOutcome,
} from "@/db";
import {
    BOOTSTRAP_API_KEY_ENV,
    readBootstrapKeyConfig,
} from "./apikey/bootstrap-config";
import { displayPrefix } from "./apikey/secret";
import { selectEffectiveApp } from "./auth/resolve-auth";

export const BOOTSTRAP_KEY_NAME = `Bootstrap (${BOOTSTRAP_API_KEY_ENV})`;

/** Throws when the bootstrap settings can't work, so startup fails before the
 * API listens instead of running without the key a bundled product needs. */
export function checkBootstrapConfig(env: NodeJS.ProcessEnv = process.env) {
    const config = readBootstrapKeyConfig(env);
    if (config.status === "invalid") {
        throw new Error(
            `${BOOTSTRAP_API_KEY_ENV} must be at least 43 characters from [A-Za-z0-9_-]. ` +
                "Generate one with: echo ml_live_$(openssl rand -hex 32)",
        );
    }
    if (config.status === "set" && !env.EMAIL?.trim()) {
        throw new Error(
            `EMAIL is required when ${BOOTSTRAP_API_KEY_ENV} is set: the key belongs to that user's default app`,
        );
    }
}

export type BootstrapResult = {
    /** Public ID of the app the bootstrap key belongs to. */
    appId?: string;
    key?: BootstrapKeyOutcome;
};

/**
 * Runs before the API listens. With `EMAIL` set, makes sure the admin user
 * and its default app exist. With `MEDIALIT_BOOTSTRAP_API_KEY` also set,
 * makes that value the admin's one active bootstrap key, so a product bundled
 * in the same compose file has a working key from its first start. Never logs
 * a secret. Throws on any problem.
 */
export async function bootstrap(
    env: NodeJS.ProcessEnv = process.env,
): Promise<BootstrapResult> {
    checkBootstrapConfig(env);
    const email = env.EMAIL?.trim().toLowerCase();
    if (!email) return {};

    const existing = await findUserByEmail(email);
    const userId = existing?.id ?? (await insertAuthUser({ email }));
    // Idempotent: creates the profile and the keyless default app if missing.
    await ensureProfile({ userId });

    const config = readBootstrapKeyConfig(env);
    if (config.status !== "set") return {};

    const app = selectEffectiveApp(await listApps(userId));
    if (!app)
        throw new Error("The admin user has no app for the bootstrap key");
    const outcome = await syncBootstrapApiKey({
        appId: app.id,
        keyHash: config.keyHash,
        keyPrefix: displayPrefix(config.secret),
        name: BOOTSTRAP_KEY_NAME,
    });
    if (outcome === "conflict") {
        throw new Error(
            `${BOOTSTRAP_API_KEY_ENV} matches an API key created in the dashboard. ` +
                "Set it to a new value instead: echo ml_live_$(openssl rand -hex 32)",
        );
    }
    return { appId: app.appId, key: outcome };
}
