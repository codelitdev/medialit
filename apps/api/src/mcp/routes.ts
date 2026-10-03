import { Router } from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpCorsHeaders, patchMcpAccept } from "@codelitdev/mcp-server-kit";
import { mcpAuth } from "../auth/middleware";
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
    const headers = mcpCorsHeaders(req.headers);
    headers["Access-Control-Allow-Headers"] =
        `${headers["Access-Control-Allow-Headers"]}, x-medialit-apikey`;
    for (const [name, value] of Object.entries(headers)) {
        res.header(name, value);
    }
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
};

function patchMcpAcceptHeaders(req: any) {
    const patched = patchMcpAccept(req.headers);
    const newAccept = Array.isArray(patched.accept)
        ? patched.accept.join(", ")
        : patched.accept;
    if (!newAccept || newAccept === req.headers.accept) return;
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
        scopes: (req.scopes ?? []) as string[],
    };
}

router.use(["/.well-known", "/oauth"], mcpCors);

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

/** Closes open MCP sessions so their streams do not hold the server open. */
export async function closeMcpSessions(): Promise<void> {
    const transports = [...mcpSessions.values()];
    mcpSessions.clear();
    await Promise.allSettled(transports.map((transport) => transport.close()));
}

export default router;
