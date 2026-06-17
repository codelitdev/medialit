import rateLimit from "express-rate-limit";

export const authenticatedApiLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests.",
    },
});
