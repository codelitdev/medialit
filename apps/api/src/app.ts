import express from "express";
import rateLimit from "express-rate-limit";
import mediaRoutes from "./media/routes";
import signatureRoutes from "./signature/routes";
import mediaSettingsRoutes from "./media-settings/routes";
import tusRoutes from "./tus/routes";
import mcpRoutes from "./mcp/routes";
import { captureException } from "./services/log";
import swaggerUi from "swagger-ui-express";
import swaggerOutput from "./swagger_output.json";
import {
    createMcpOAuthDiscoveryRoutes,
    type BetterAuthMetadataApi,
} from "@codelitdev/oauth-server-kit/mcp";
import { createOAuthPagesRouter } from "@codelitdev/oauth-server-kit/express";
import { toNodeHandler } from "better-auth/node";
import type { apiReadiness } from "./lifecycle";
import { cleanupTUSUploads } from "./tus/cleanup";
import { cleanupExpiredTempUploads } from "./media/cleanup";
import type { MedialitAuth } from "./auth/better-auth";
import { AUTH_BASE_PATH, MCP_SCOPES_SUPPORTED } from "./auth/options";
import { setBearerAuth } from "./auth/bearer";
import { createOAuthAppPages } from "./auth/oauth-app-pages";
import { oauthAppSelectionAdapter } from "./auth/oauth-app-selection";
import { createDashboardRouter } from "./dashboard/routes";
import { billingWebhookRouter, createBillingRouter } from "./billing/routes";

type ReadinessReport = Awaited<ReturnType<typeof apiReadiness>>;

/**
 * Compose the API's HTTP stack. `index.ts` serves it in production and the
 * platform conformance test serves the same app on an ephemeral port.
 */
export function createApp(input: {
    auth: MedialitAuth;
    webOrigin: string;
    readiness: () => Promise<ReadinessReport>;
}): express.Express {
    const { auth, webOrigin } = input;
    const app = express();

    app.set(
        "trust proxy",
        process.env.ENABLE_TRUST_PROXY === "true" ? 1 : false,
    );

    setBearerAuth(auth);
    app.use(
        createMcpOAuthDiscoveryRoutes({
            auth: auth.auth as unknown as BetterAuthMetadataApi,
            oauthResourceClient: auth.oauthResourceClient,
            resourceUrl: auth.mcpResource,
            scopesSupported: [...MCP_SCOPES_SUPPORTED],
            allowedOrigins: "*",
        }),
    );
    app.use(
        `${AUTH_BASE_PATH}/oauth2/register`,
        rateLimit({
            windowMs: 60_000,
            max: 20,
            standardHeaders: true,
            legacyHeaders: false,
            message: {
                error: "too_many_requests",
                error_description: "Too many client registration requests.",
            },
        }),
    );
    app.all(`${AUTH_BASE_PATH}/*`, toNodeHandler(auth.auth));
    app.use(
        createOAuthPagesRouter({
            appName: "MediaLit",
            authBasePath: AUTH_BASE_PATH,
            allowedRedirectOrigins: [new URL(webOrigin).origin],
            defaultRedirectUrl: `${webOrigin}/`,
            loginMethods: [{ type: "email-otp" }],
        }),
    );
    app.use(
        createOAuthAppPages({
            auth: auth.auth,
            adapter: oauthAppSelectionAdapter,
            authBasePath: AUTH_BASE_PATH,
        }),
    );

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
        "/ready",
        /* #swagger.ignore = true */
        async (req, res) => {
            const report = await input.readiness();
            res.status(report.status === "ready" ? 200 : 503).json(report);
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

    app.use(createDashboardRouter(auth));
    app.use(createBillingRouter(auth));
    // Platform convention for provider webhooks: POST /webhooks/billing/<provider>.
    app.use("/webhooks/billing", billingWebhookRouter());
    app.use(jsonErrorHandler);
    return app;
}

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
