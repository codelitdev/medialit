import { config as loadDotFile } from "dotenv";
loadDotFile();

import { checkDatabaseConnection } from "./config/db";
import { closeMcpSessions } from "./mcp/routes";
import logger, { shutdownObservability } from "./services/log";
import { createUser, findByEmail } from "./user/queries";
import { User } from "@medialit/models";
import { getApiKeyByUserId } from "./apikey/queries";
import { closeDb, getDb, seedWebOAuthClient } from "@/db";
import { sql } from "drizzle-orm";
import type { GracefulShutdown } from "@codelitdev/platform";
import { apiReadiness, createApiShutdown } from "./lifecycle";

import { spawn } from "child_process";
import { cleanupTUSUploads } from "./tus/cleanup";
import { cleanupExpiredTempUploads } from "./media/cleanup";
import { HOUR_IN_SECONDS } from "./config/constants";
import { createMedialitAuth } from "./auth/better-auth";
import { createApp } from "./app";
import { startBillingMaintenance } from "./billing/maintenance";

let started = false;
let shutdown: GracefulShutdown | undefined;

const port = process.env.PORT || 80;

checkConfig()
    .then(() => checkDatabaseConnection())
    .then(checkDependencies)
    .then(async () => {
        const publicApiUrl = (
            process.env.PUBLIC_API_URL ||
            process.env.API_SERVER ||
            `http://localhost:${port}`
        ).replace(/\/$/, "");
        const webOrigin = (
            process.env.WEB_ORIGIN ||
            process.env.WEB_CLIENT ||
            "http://localhost:3000"
        ).replace(/\/$/, "");
        const secret = process.env.BETTER_AUTH_SECRET!;
        const auth = createMedialitAuth({ publicApiUrl, secret, webOrigin });
        const app = createApp({
            auth,
            webOrigin,
            readiness: () =>
                apiReadiness({
                    started,
                    shuttingDown: shutdown?.shuttingDown() ?? false,
                    pingDatabase: () => getDb().execute(sql`select 1`),
                }),
        });
        await seedWebOAuthClient({
            redirectUris: [`${webOrigin}/api/auth/callback/medialit`],
        });
        if (process.env.EMAIL) {
            await createAdminUser();
        }
        const stopBillingMaintenance = startBillingMaintenance();
        const server = app.listen(port, () => {
            started = true;
            logger.info(`Medialit server running at ${port}`);
        });

        // Setup background cleanup job for expired tus uploads
        const tusCleanup = setInterval(
            async () => {
                await cleanupTUSUploads();
            },
            HOUR_IN_SECONDS, // 1 hour
        );

        // Setup background cleanup job for expired temp uploads
        const tempCleanup = setInterval(
            async () => {
                await cleanupExpiredTempUploads();
            },
            HOUR_IN_SECONDS, // 1 hour
        );

        const apiShutdown = createApiShutdown({
            stopBackgroundJobs: async () => {
                clearInterval(tusCleanup);
                clearInterval(tempCleanup);
                await stopBillingMaintenance();
            },
            closeMcpSessions,
            closeServer: () =>
                new Promise<void>((resolve, reject) => {
                    server.close((error) =>
                        error ? reject(error) : resolve(),
                    );
                    // Keep-alive sockets with no request would hold close open.
                    server.closeIdleConnections?.();
                }),
            closeDatabase: closeDb,
            flushObservability: () => shutdownObservability(1_000),
        });
        shutdown = apiShutdown;
        const handleSignal = (signal: NodeJS.Signals) => {
            logger.info({ signal }, "Shutting down");
            apiShutdown
                .shutdown()
                .then(() => process.exit(0))
                .catch((error) => {
                    logger.error({ err: error }, "Graceful shutdown failed");
                    process.exit(1);
                });
        };
        process.on("SIGTERM", handleSignal);
        process.on("SIGINT", handleSignal);
    });

async function checkConfig() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set");
    }
    if (!process.env.CLOUD_KEY || !process.env.CLOUD_SECRET) {
        throw new Error(
            "Cloud credentials (CLOUD_KEY and CLOUD_SECRET) are not set",
        );
    }
    if (
        !process.env.CLOUD_BUCKET_NAME ||
        !process.env.CLOUD_PUBLIC_BUCKET_NAME
    ) {
        throw new Error(
            "Cloud bucket name (CLOUD_BUCKET_NAME and CLOUD_PUBLIC_BUCKET_NAME) are not set",
        );
    }
    if (
        !process.env.CDN_ENDPOINT &&
        (!process.env.CLOUD_ENDPOINT || !process.env.CLOUD_ENDPOINT_PUBLIC)
    ) {
        throw new Error(
            "If CDN_ENDPOINT is not set, both CLOUD_ENDPOINT and CLOUD_ENDPOINT_PUBLIC must be provided",
        );
    }
    if (
        !process.env.BETTER_AUTH_SECRET ||
        Buffer.byteLength(process.env.BETTER_AUTH_SECRET, "utf8") < 32
    ) {
        throw new Error(
            "BETTER_AUTH_SECRET is required and must be at least 32 bytes (256 bits). " +
                "Generate one with: openssl rand -base64 48",
        );
    }
}

async function checkDependencies() {
    try {
        // Check ffmpeg
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn("ffmpeg", ["-version"]);
            ffmpeg.on("error", () =>
                reject(new Error("ffmpeg is not installed")),
            );
            ffmpeg.on("exit", (code) => {
                if (code === 0) resolve(true);
                else reject(new Error("ffmpeg is not installed"));
            });
        });

        // Check webp
        await new Promise((resolve, reject) => {
            const webp = spawn("cwebp", ["-version"]);
            webp.on("error", () => reject(new Error("webp is not installed")));
            webp.on("exit", (code) => {
                if (code === 0) resolve(true);
                else reject(new Error("webp is not installed"));
            });
        });
    } catch (error: any) {
        logger.error({ error: error.message });
        process.exit(1);
    }
}

async function createAdminUser() {
    try {
        const email = process.env.EMAIL!.toLowerCase();
        const user: User | null = await findByEmail(email);

        if (!user) {
            const user = await createUser(email);
            const keys = await getApiKeyByUserId(user.id);
            const firstKey = Array.isArray(keys) ? keys[0] : keys;
            logger.info({ apiKey: firstKey?.key }, "Admin user created");
        }
    } catch (error) {
        logger.error({ error }, "Failed to create admin user");
    }
}
