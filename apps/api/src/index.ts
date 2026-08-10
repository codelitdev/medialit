import { config as loadDotFile } from "dotenv";
loadDotFile();

import express from "express";
import connectToDatabase from "./config/db";
import passport from "passport";
import mediaRoutes from "./media/routes";
import signatureRoutes from "./signature/routes";
import mediaSettingsRoutes from "./media-settings/routes";
import tusRoutes from "./tus/routes";
import mcpRoutes from "./mcp/routes";
import logger from "./services/log";
import { createUser, findByEmail } from "./user/queries";
import { User } from "@medialit/models";
import { getApiKeyByUserId } from "./apikey/queries";
import swaggerUi from "swagger-ui-express";
import swaggerOutput from "./swagger_output.json";
import { toNodeHandler } from "better-auth/node";

import { spawn } from "child_process";
import { cleanupTUSUploads } from "./tus/cleanup";
import { cleanupExpiredTempUploads } from "./media/cleanup";
import { HOUR_IN_SECONDS } from "./config/constants";
import webInternalRoutes from "./web-internal/routes";
import oauthPagesRoutes from "./auth/oauth-pages";
import {
    authBasePath,
    ensureWebOAuthClient,
    getAuth,
    initializeAuth,
} from "./auth/better-auth";

const app = express();

app.set("trust proxy", process.env.ENABLE_TRUST_PROXY === "true" ? 1 : false);

// Better Auth owns its request parsing and must run before Express's body
// parsers. The instance is initialized after Postgres is connected, before
// the server starts accepting requests.
const betterAuthHandler = (req: express.Request, res: express.Response) =>
    toNodeHandler(getAuth())(req, res);

app.all("/api/auth/*", betterAuthHandler);
// RFC 8414 places authorization-server metadata before an issuer path. Better
// Auth can produce this response, but Express must also mount that canonical
// URL because our auth handler otherwise lives beneath /api/auth.
app.all(
    `/.well-known/oauth-authorization-server${authBasePath}`,
    betterAuthHandler,
);
app.use(oauthPagesRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/internal/web", webInternalRoutes);

app.get(
    "/health",
    /* 
        #swagger.summary = 'Status of the server', 
        #swagger.description = 'Returns the status of the server and uptime'
        #swagger.responses[200] = {
            description: "OK",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            status: {
                                type: "string",
                                example: "ok",
                            },
                            uptime: {
                                type: "number",
                                example: 12.345,
                            },
                        },
                    },
                },
            },
        }
    */
    (req, res) => {
        res.status(200).json({
            status: "ok",
            uptime: process.uptime(),
        });
    },
);

app.get(
    "/openapi.json",
    /* #swagger.ignore = true */
    (req, res) => {
        res.json(swaggerOutput);
    },
);

app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerOutput, {
        explorer: true,
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            docExpansion: "none",
            defaultModelsExpandDepth: -1,
            validatorUrl: null,
        },
    }),
);

app.use("/settings/media", mediaSettingsRoutes(passport));
app.use("/media/signature", signatureRoutes);
app.use("/media", tusRoutes);
app.use("/media", mediaRoutes);
app.use(mcpRoutes);

app.get(
    "/cleanup/temp",
    /* #swagger.ignore = true */
    async (req, res) => {
        await cleanupExpiredTempUploads();
        res.status(200).json({
            message: "Expired temp uploads cleaned up",
        });
    },
);
app.get(
    "/cleanup/tus",
    /* #swagger.ignore = true */
    async (req, res) => {
        await cleanupTUSUploads();
        res.status(200).json({
            message: "Expired tus uploads cleaned up",
        });
    },
);

const port = process.env.PORT || 80;

async function main(): Promise<void> {
    await checkConfig();
    await connectToDatabase();
    initializeAuth();
    await ensureWebOAuthClient();
    await checkDependencies();

    if (process.env.EMAIL) await createAdminUser();

    app.listen(port, () => {
        logger.info(`Medialit server running at ${port}`);
    });

    setInterval(cleanupTUSUploads, HOUR_IN_SECONDS).unref();
    setInterval(cleanupExpiredTempUploads, HOUR_IN_SECONDS).unref();
}

async function checkConfig() {
    if (!process.env.DB_CONNECTION_STRING) {
        throw new Error("DB_CONNECTION_STRING is not set");
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
    const authSecret =
        process.env.BETTER_AUTH_SECRET || process.env.OAUTH_SIGNING_KEY;
    if (!authSecret || Buffer.byteLength(authSecret, "utf8") < 32) {
        throw new Error(
            "BETTER_AUTH_SECRET is required and must be at least 32 bytes (256 bits). " +
                "Generate one with: openssl rand -base64 48",
        );
    }
    if (
        !process.env.WEB_INTERNAL_API_SECRET ||
        Buffer.byteLength(process.env.WEB_INTERNAL_API_SECRET, "utf8") < 32
    ) {
        throw new Error(
            "WEB_INTERNAL_API_SECRET is required and must be at least 32 bytes. " +
                "Generate one with: openssl rand -hex 32",
        );
    }
}

async function checkDependencies() {
    // Check ffmpeg
    await new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", ["-version"]);
        ffmpeg.on("error", () => reject(new Error("ffmpeg is not installed")));
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
}

async function createAdminUser() {
    try {
        const email = process.env.EMAIL!.toLowerCase();
        const user: User | null = await findByEmail(email);

        if (!user) {
            const user = await createUser(email, undefined, "subscribed");
            const keys = await getApiKeyByUserId(user.id);
            const firstKey = Array.isArray(keys) ? keys[0] : keys;
            logger.info({ apiKey: firstKey?.key }, "Admin user created");
        }
    } catch (error) {
        logger.error({ error }, "Failed to create admin user");
    }
}

main().catch((error) => {
    logger.fatal({ error }, "Failed to start MediaLit");
    process.exitCode = 1;
});
