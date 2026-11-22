import rateLimit from "express-rate-limit";

const DEFAULT_REQUESTS_PER_MINUTE = 120;

/** Requests per minute per client for API-key and OAuth REST calls. The
 * integration stack raises it, because its suites make hundreds of calls
 * from one address within a minute. */
export function apiRequestsPerMinute(
    env: NodeJS.ProcessEnv = process.env,
): number {
    const value = env.API_RATE_LIMIT_PER_MINUTE;
    if (value === undefined || value.trim() === "") {
        return DEFAULT_REQUESTS_PER_MINUTE;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(
            "API_RATE_LIMIT_PER_MINUTE must be a positive whole number",
        );
    }
    return parsed;
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
