import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const KEYS = (process.env.OAUTH_SIGNING_KEY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const SIGNING_KEY = KEYS[0];
const VERIFY_KEYS = KEYS;

const ACCESS_TOKEN_TTL = Number(process.env.TOKEN_TTL_SECONDS) || 900;
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

export function signAccessToken(
    userId: string,
    clientId: string,
    scope: string[] = [],
): string {
    return jwt.sign(
        { sub: userId, cid: clientId, typ: "access", scope: scope.join(" ") },
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

export function verifyToken(
    token: string,
    expectedType: "access" | "refresh",
): {
    sub: string;
    cid: string;
    scope: string[];
    exp?: number;
    jti?: string;
} | null {
    for (const key of VERIFY_KEYS) {
        try {
            const decoded = jwt.verify(token, key, {
                algorithms: ["HS256"],
            }) as any;
            if (decoded.typ !== expectedType) return null;
            return {
                sub: decoded.sub,
                cid: decoded.cid,
                scope: normalizeScope(decoded.scope),
                exp: decoded.exp,
                jti: decoded.jti,
            };
        } catch {
            continue;
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

function normalizeScope(scope: unknown): string[] {
    if (Array.isArray(scope)) {
        return scope.filter((item): item is string => typeof item === "string");
    }
    if (typeof scope === "string") {
        return scope.split(/\s+/).filter(Boolean);
    }
    return [];
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL;
