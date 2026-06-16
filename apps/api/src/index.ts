import { config as loadDotFile } from "dotenv";
loadDotFile();

import express from "express";
import rateLimit from "express-rate-limit";
import connectToDatabase from "./config/db";
import passport from "passport";
import mediaRoutes from "./media/routes";
import signatureRoutes from "./signature/routes";
import mediaSettingsRoutes from "./media-settings/routes";
import tusRoutes from "./tus/routes";
import logger from "./services/log";
import { createUser, findByEmail } from "./user/queries";
import { Apikey, User } from "@medialit/models";
import { getApiKeyByUserId } from "./apikey/queries";
import swaggerUi from "swagger-ui-express";
import swaggerOutput from "./swagger_output.json";
import { mcpAuth } from "./auth/middleware";
import { oauthRouter } from "./oauth/server";

import { spawn } from "child_process";
import { cleanupTUSUploads } from "./tus/cleanup";
import { cleanupExpiredTempUploads } from "./media/cleanup";
import { HOUR_IN_SECONDS } from "./config/constants";
import { createMCPSession } from "./mcp/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

connectToDatabase();
const app = express();

app.set("trust proxy", process.env.ENABLE_TRUST_PROXY === "true");

app.use(express.json());
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

app.use("/settings/media", mediaSettingsRoutes(passport));
app.use("/media/signature", signatureRoutes);
app.use("/media", tusRoutes);
app.use("/media", mediaRoutes);

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

const mcpLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests.",
    },
});

// Active MCP sessions: sessionId → transport
const mcpSessions = new Map<string, StreamableHTTPServerTransport>();

// CORS middleware for MCP and OAuth endpoints
const mcpCors = (req: any, res: any, next: any) => {
    const origin = req.headers.origin || "*";
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, x-medialit-apikey, Authorization",
    );
    res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
};

// OAuth endpoints + CORS (no auth required — these are the auth flow itself)
app.use(["/.well-known", "/oauth"], mcpCors);
app.use(oauthRouter);

app.post("/mcp", mcpCors, mcpLimiter, mcpAuth, async (req: any, res: any) => {
    // The MCP SDK (via @hono/node-server) reads rawHeaders to build the Web Standard
    // Request, so we must patch both req.headers AND req.rawHeaders.
    // The SDK requires Accept to include BOTH application/json and text/event-stream.
    const accept = req.headers.accept || "";
    const needsJson = !accept.includes("application/json");
    const needsSSE = !accept.includes("text/event-stream");
    if (needsJson || needsSSE) {
        const additions: string[] = [];
        if (needsJson) additions.push("application/json");
        if (needsSSE) additions.push("text/event-stream");
        const newAccept = accept
            ? `${accept}, ${additions.join(", ")}`
            : additions.join(", ");
        req.headers.accept = newAccept;
        // Patch rawHeaders (used by @hono/node-server to build the Web Standard Request)
        const rawHeaders: string[] = req.rawHeaders;
        let found = false;
        for (let i = 0; i < rawHeaders.length; i += 2) {
            if (rawHeaders[i].toLowerCase() === "accept") {
                rawHeaders[i + 1] = newAccept;
                found = true;
                break;
            }
        }
        if (!found) rawHeaders.push("Accept", newAccept);
    }

    const auth = {
        token: req.apikey || "",
        clientId: String(req.userId || req.user?._id || req.user?.id || ""),
        scopes: [] as string[],
    };

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId) {
        // Route to an existing session
        const transport = mcpSessions.get(sessionId);
        if (!transport) {
            return res.status(404).json({
                jsonrpc: "2.0",
                error: { code: -32001, message: "Session not found" },
                id: null,
            });
        }
        await transport.handleRequest(
            Object.assign(req, { auth }),
            res,
            req.body,
        );
    } else {
        // New session — create a dedicated transport + server pair
        const transport = createMCPSession(
            (id) => mcpSessions.set(id, transport),
            (id) => mcpSessions.delete(id),
        );
        await transport.handleRequest(
            Object.assign(req, { auth }),
            res,
            req.body,
        );
    }
});

// CORS preflight for ChatGPT/web-based MCP clients
app.options("/mcp", mcpCors);

const port = process.env.PORT || 80;

if (process.env.EMAIL) {
    createAdminUser();
}

checkConfig()
    .then(checkDependencies)
    .then(() => {
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
