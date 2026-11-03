import { mcpCorsHeaders } from "@codelitdev/mcp-server-kit";
import {
    createPlatformError,
    type HeaderMap,
    toPublicHttpError,
} from "@codelitdev/platform";
import express, {
    type NextFunction,
    type Request,
    type Response,
    Router,
} from "express";
import rateLimit from "express-rate-limit";
import { getMcpResourceMetadataUrl } from "../auth/bearer";
import { runMcpRequest } from "./context";
import { createMedialitMcp } from "./server";

/** MediaLit's own API-key header, allowed on top of the kit's CORS list. */
const MEDIALIT_CORS_HEADERS = "x-medialit-apikey";

const router = Router();
const mcp = createMedialitMcp();

const mcpLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    skip: (req) => req.method === "OPTIONS",
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests.",
    },
});

/** Protocol parse errors go back as JSON-RPC, not Express error pages. The
 * limit fits `upload_media`'s base64 file content. */
function jsonBody(req: Request, res: Response, next: NextFunction) {
    if (req.method !== "POST") return next();
    if (!req.is("application/json")) {
        res.status(415).json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Content-Type must be application/json",
            },
            id: null,
        });
        return;
    }
    express.json({ limit: "2mb" })(req, res, (error?: unknown) => {
        if (error) {
            res.status(400).json({
                jsonrpc: "2.0",
                error: { code: -32700, message: "Parse error" },
                id: null,
            });
            return;
        }
        next();
    });
}

function withMedialitHeaders(res: Response) {
    const allowed = res.getHeader("Access-Control-Allow-Headers");
    if (allowed) {
        res.setHeader(
            "Access-Control-Allow-Headers",
            `${allowed}, ${MEDIALIT_CORS_HEADERS}`,
        );
    }
}

function discoveryCors(req: Request, res: Response, next: NextFunction) {
    for (const [name, value] of Object.entries(mcpCorsHeaders(req.headers))) {
        res.setHeader(name, value);
    }
    withMedialitHeaders(res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    next();
}

router.use(["/.well-known", "/oauth"], discoveryCors);

router.all(
    "/mcp",
    mcpLimiter,
    jsonBody,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const headers: Record<string, string | string[] | undefined> = {
                ...req.headers,
            };
            // MediaLit clients send their key as `x-medialit-apikey`; the kit
            // reads `X-API-Key`. Both at once stay ambiguous.
            const medialitKey = headers["x-medialit-apikey"];
            delete headers["x-medialit-apikey"];
            if (medialitKey && headers["x-api-key"]) {
                const ambiguous = toPublicHttpError(
                    createPlatformError("credential_ambiguous"),
                );
                res.status(ambiguous.status).json(ambiguous.body);
                return;
            }
            if (medialitKey) headers["x-api-key"] = medialitKey;

            const controller = new AbortController();
            res.once("close", () => {
                if (!res.writableFinished) controller.abort();
            });
            const result = await runMcpRequest(() =>
                mcp.handle({
                    method: req.method,
                    headers: headers as HeaderMap,
                    body: req.body,
                    signal: controller.signal,
                }),
            );

            for (const [name, value] of Object.entries(result.headers)) {
                res.setHeader(name, value);
            }
            withMedialitHeaders(res);
            const resourceMetadataUrl = getMcpResourceMetadataUrl();
            if (result.status === 401 && resourceMetadataUrl) {
                // Spec-compliant MCP clients discover OAuth from this challenge.
                res.setHeader(
                    "WWW-Authenticate",
                    `Bearer resource_metadata="${resourceMetadataUrl}"`,
                );
            }
            res.status(result.status);
            if (result.body === null) res.end();
            else res.json(result.body);
        } catch (error) {
            next(error);
        }
    },
);

/** Refuses new MCP requests and closes the kit's handler. */
export function closeMcp(): Promise<void> {
    return mcp.shutdown();
}

export default router;
