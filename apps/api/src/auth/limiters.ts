import rateLimit from "express-rate-limit";
import { wholeNumberSetting } from "../config/env";

const DEFAULT_REQUESTS_PER_MINUTE = 120;
const DEFAULT_MCP_REQUESTS_PER_MINUTE = 60;

/** Requests per minute per client for API-key and OAuth REST calls. The
 * integration stack raises it, because its suites make hundreds of calls
 * from one address within a minute. */
export function apiRequestsPerMinute(
    env: NodeJS.ProcessEnv = process.env,
): number {
    return wholeNumberSetting(
        env,
        "API_RATE_LIMIT_PER_MINUTE",
        DEFAULT_REQUESTS_PER_MINUTE,
    );
}

/** Requests per minute per client to the MCP server. The integration stack
 * raises it, as for REST. */
export function mcpRequestsPerMinute(
    env: NodeJS.ProcessEnv = process.env,
): number {
    return wholeNumberSetting(
        env,
        "MCP_RATE_LIMIT_PER_MINUTE",
        DEFAULT_MCP_REQUESTS_PER_MINUTE,
    );
}

export const authenticatedApiLimiter = rateLimit({
    windowMs: 60_000,
    max: apiRequestsPerMinute(),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests.",
    },
});
