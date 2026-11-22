import rateLimit from "express-rate-limit";

const DEFAULT_REQUESTS_PER_MINUTE = 120;
const DEFAULT_MCP_REQUESTS_PER_MINUTE = 60;

function requestsPerMinute(
    env: NodeJS.ProcessEnv,
    name: string,
    fallback: number,
): number {
    const value = env[name];
    if (value === undefined || value.trim() === "") {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive whole number`);
    }
    return parsed;
}

/** Requests per minute per client for API-key and OAuth REST calls. The
 * integration stack raises it, because its suites make hundreds of calls
 * from one address within a minute. */
export function apiRequestsPerMinute(
    env: NodeJS.ProcessEnv = process.env,
): number {
    return requestsPerMinute(
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
    return requestsPerMinute(
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
