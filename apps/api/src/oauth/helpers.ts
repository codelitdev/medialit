import crypto from "crypto";
import { Request as ExpressReq } from "express";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

export function generateOtp(): string {
    return String(Math.floor(100000 + crypto.randomInt(0, 900000)));
}

export function hashOtp(pendingId: string, otp: string): string {
    return crypto
        .createHmac("sha256", process.env.OAUTH_SIGNING_KEY || "")
        .update(`${pendingId}:${otp}`)
        .digest("hex");
}

export function generatePendingId(): string {
    return crypto.randomBytes(16).toString("hex");
}

export function singleQueryParam(val: unknown): string | undefined {
    if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : undefined;
    if (val === undefined || val === null) return undefined;
    return String(val);
}

export function redirectUriMatchesRegistered(
    redirectUri: string,
    registeredUris: string[],
): boolean {
    return registeredUris.some((uri) => redirectUri === uri);
}

export function reqHeadersHost(req: ExpressReq): string | null {
    const forwarded = req.headers["x-forwarded-host"];
    if (forwarded) return Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const host = req.headers.host;
    if (host) return Array.isArray(host) ? host[0] : host;
    return null;
}
