import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const KEYS = (process.env.OAUTH_SIGNING_KEY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const SIGNING_KEY = KEYS[0]; // first key signs new tokens
const VERIFY_KEYS = KEYS; // all keys accepted for verification (rotation)

const ACCESS_TOKEN_TTL = Number(process.env.MCP_TOKEN_TTL_SECONDS) || 3600;
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

export function signAccessToken(
    userId: string,
    clientId: string,
    scope: string[] = [],
): string {
    return jwt.sign(
        { sub: userId, cid: clientId, typ: "access", scope },
        SIGNING_KEY,
        { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL, noTimestamp: false },
    );
}

export function signRefreshToken(userId: string, clientId: string): string {
    return jwt.sign(
        {
            sub: userId,
            cid: clientId,
            typ: "refresh",
            jti: randomUUID(),
        },
        SIGNING_KEY,
        { algorithm: "HS256", expiresIn: REFRESH_TOKEN_TTL },
    );
}

/**
 * Verify a token (access OR refresh). Returns the decoded payload on success,
 * or null if the signature is invalid, the token is expired, or the type
 * does not match `expectedType`.
 */
export function verifyToken(
    token: string,
    expectedType: "access" | "refresh",
): { sub: string; cid: string; scope: string[]; jti?: string } | null {
    for (const key of VERIFY_KEYS) {
        try {
            const decoded = jwt.verify(token, key, {
                algorithms: ["HS256"],
            }) as any;
            if (decoded.typ !== expectedType) return null;
            return {
                sub: decoded.sub,
                cid: decoded.cid,
                scope: decoded.scope ?? [],
                jti: decoded.jti,
            };
        } catch {
            // try next key
        }
    }
    return null;
}

export function verifyAccessToken(token: string) {
    return verifyToken(token, "access");
}

export function verifyRefreshToken(token: string) {
    return verifyToken(token, "refresh");
}

// ---------------------------------------------------------------------------
// Helpers for callers (e.g. model.ts) that need the TTL in seconds
// ---------------------------------------------------------------------------

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL;
