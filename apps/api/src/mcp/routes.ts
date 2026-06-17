import { Router } from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuth } from "../auth/middleware";
import { oauthRouter } from "../oauth/routes";
import { createMCPSession } from "./server";

const router = Router();

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

const mcpSessions = new Map<string, StreamableHTTPServerTransport>();

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

function patchMcpAcceptHeaders(req: any) {
    const accept = req.headers.accept || "";
    const needsJson = !accept.includes("application/json");
    const needsSSE = !accept.includes("text/event-stream");
    if (!needsJson && !needsSSE) return;

    const additions: string[] = [];
    if (needsJson) additions.push("application/json");
    if (needsSSE) additions.push("text/event-stream");
    const newAccept = accept
        ? `${accept}, ${additions.join(", ")}`
        : additions.join(", ");
    req.headers.accept = newAccept;

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

function getMcpAuth(req: any) {
    return {
        token: req.apikey || "",
        clientId: String(req.userId || req.user?._id || req.user?.id || ""),
        user: req.user,
        scopes: [] as string[],
    };
}

router.use(["/.well-known", "/oauth"], mcpCors);
router.use(oauthRouter);

router.post(
    "/mcp",
    mcpCors,
    mcpLimiter,
    mcpAuth,
    async (req: any, res: any) => {
        patchMcpAcceptHeaders(req);

        const auth = getMcpAuth(req);
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId) {
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
    },
);

router.options("/mcp", mcpCors);

export default router;
