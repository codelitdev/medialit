import { Router } from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpCorsHeaders, patchMcpAccept } from "@codelitdev/mcp-server-kit";
import { mcpAuth } from "../auth/middleware";
import { createMcpAuthInfo } from "./auth-context";
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

/** Runs after `mcpAuth`, which accepts exactly one of an OAuth bearer token
 * or an `x-medialit-apikey` header. */
function attachMcpAuthInfo(req: any, res: any, next: any) {
    const authInfo = createMcpAuthInfo(req);
    if (!authInfo) {
        return res.status(401).json({
            error: "unauthorized",
            error_description: "MCP authentication context is incomplete.",
        });
    }
    req.auth = authInfo;
    next();
}

router.use(["/.well-known", "/oauth"], mcpCors);

router.post(
    "/mcp",
    mcpCors,
    mcpLimiter,
    mcpAuth,
    attachMcpAuthInfo,
    async (req: any, res: any) => {
        patchMcpAcceptHeaders(req);

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
            await transport.handleRequest(req, res, req.body);
        } else {
            const transport = createMCPSession(
                (id) => mcpSessions.set(id, transport),
                (id) => mcpSessions.delete(id),
            );
            await transport.handleRequest(req, res, req.body);
        }
    },
);

router.delete(
    "/mcp",
    mcpCors,
    mcpLimiter,
    mcpAuth,
    attachMcpAuthInfo,
    async (req: any, res: any) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId) {
            return res.status(400).json({
                jsonrpc: "2.0",
                error: { code: -32600, message: "Session ID required" },
                id: null,
            });
        }

        const transport = mcpSessions.get(sessionId);
        if (!transport) {
            return res.status(404).json({
                jsonrpc: "2.0",
                error: { code: -32001, message: "Session not found" },
                id: null,
            });
        }

        await transport.handleRequest(req, res);
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
