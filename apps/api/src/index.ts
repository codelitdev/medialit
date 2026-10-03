import { config as loadDotFile } from "dotenv";
loadDotFile();

import express from "express";
import connectToDatabase from "./config/db";
import mediaRoutes from "./media/routes";
import signatureRoutes from "./signature/routes";
import mediaSettingsRoutes from "./media-settings/routes";
import tusRoutes from "./tus/routes";
import mcpRoutes from "./mcp/routes";
import logger, { captureException } from "./services/log";
import { createUser, findByEmail } from "./user/queries";
import { User } from "@medialit/models";
import { getApiKeyByUserId } from "./apikey/queries";
import swaggerUi from "swagger-ui-express";
import swaggerOutput from "./swagger_output.json";
import {
    createMcpOAuthDiscoveryRoutes,
    type BetterAuthMetadataApi,
} from "@codelitdev/oauth-server-kit/mcp";
import { createOAuthPagesRouter } from "@codelitdev/oauth-server-kit/express";
import { toNodeHandler } from "better-auth/node";
import { seedWebOAuthClient } from "@/db";

import { spawn } from "child_process";
import { cleanupTUSUploads } from "./tus/cleanup";
import { cleanupExpiredTempUploads } from "./media/cleanup";
import { HOUR_IN_SECONDS } from "./config/constants";
import { createMedialitAuth } from "./auth/better-auth";
import { AUTH_BASE_PATH, MCP_SCOPES_SUPPORTED } from "./auth/options";
import { setBearerAuth } from "./auth/bearer";
import { legacyOAuthRouter } from "./auth/legacy-oauth";
import { createDashboardRouter } from "./dashboard/routes";
import { createBillingRouter, dodoWebhookRouter } from "./billing/routes";
import { startBillingMaintenance } from "./billing/maintenance";

const app = express();

app.set("trust proxy", process.env.ENABLE_TRUST_PROXY === "true" ? 1 : false);

const authRouter = express.Router();
app.use(authRouter);

app.use(
    express.json({
        limit: "2mb",
        verify: (req, _res, buf) => {
            (req as express.Request & { rawBody?: Buffer }).rawBody =
                Buffer.from(buf);
        },
    }),
);
app.use(express.urlencoded({ extended: false }));

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

app.use("/settings/media", mediaSettingsRoutes(undefined));
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

checkConfig()
    .then(() => connectToDatabase())
    .then(checkDependencies)
    .then(async () => {
        const publicApiUrl = (
            process.env.PUBLIC_API_URL ||
            process.env.API_SERVER ||
            `http://127.0.0.1:${port}`
        ).replace(/\/$/, "");
        const webOrigin = (
            process.env.WEB_ORIGIN ||
            process.env.WEB_CLIENT ||
            "http://localhost:3000"
        ).replace(/\/$/, "");
        const secret =
            process.env.BETTER_AUTH_SECRET || process.env.OAUTH_SIGNING_KEY!;
        const auth = createMedialitAuth({ publicApiUrl, secret, webOrigin });
        setBearerAuth(auth);
        authRouter.use(
            createMcpOAuthDiscoveryRoutes({
                auth: auth.auth as unknown as BetterAuthMetadataApi,
                oauthResourceClient: auth.oauthResourceClient,
                resourceUrl: auth.mcpResource,
                scopesSupported: [...MCP_SCOPES_SUPPORTED],
                allowedOrigins: "*",
            }),
        );
        authRouter.all(`${AUTH_BASE_PATH}/*`, toNodeHandler(auth.auth));
        authRouter.use(
            createOAuthPagesRouter({
                appName: "MediaLit",
                authBasePath: AUTH_BASE_PATH,
                allowedRedirectOrigins: [new URL(webOrigin).origin],
                defaultRedirectUrl: `${webOrigin}/`,
                loginMethods: [{ type: "email-otp" }],
            }),
        );
        app.use(legacyOAuthRouter(auth));
        app.use(createDashboardRouter(auth));
        app.use(createBillingRouter(auth));
        app.use("/payment/webhook/dodo", dodoWebhookRouter());
        app.use(jsonErrorHandler);
        await seedWebOAuthClient({
            redirectUris: [`${webOrigin}/api/auth/callback/medialit`],
        });
        if (process.env.EMAIL) {
            await createAdminUser();
        }
        startBillingMaintenance();
        app.listen(port, () => {
            logger.info(`Medialit server running at ${port}`);
        });

        // Setup background cleanup job for expired tus uploads
        setInterval(
            async () => {
                await cleanupTUSUploads();
            },
            HOUR_IN_SECONDS, // 1 hour
        );

        // Setup background cleanup job for expired temp uploads
        setInterval(
            async () => {
                await cleanupExpiredTempUploads();
            },
            HOUR_IN_SECONDS, // 1 hour
        );
    });

function jsonErrorHandler(
    error: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) {
    captureException({
        error,
        source: "express",
        context: { method: req.method, path: req.path },
    });
    if (res.headersSent) {
        next(error);
        return;
    }
    res.status(500).json({ error: "Internal Server Error" });
}

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
        !process.env.OAUTH_SIGNING_KEY ||
        Buffer.byteLength(process.env.OAUTH_SIGNING_KEY, "utf8") < 32
    ) {
        throw new Error(
            "OAUTH_SIGNING_KEY is required and must be at least 32 bytes (256 bits). " +
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
            const user = await createUser(email, undefined, "subscribed");
            const keys = await getApiKeyByUserId(user.id);
            const firstKey = Array.isArray(keys) ? keys[0] : keys;
            logger.info({ apiKey: firstKey?.key }, "Admin user created");
        }
    } catch (error) {
        logger.error({ error }, "Failed to create admin user");
    }
}
