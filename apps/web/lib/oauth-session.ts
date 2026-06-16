export const ACCESS_TOKEN_COOKIE = "session_access_token";
export const REFRESH_TOKEN_COOKIE = "session_refresh_token";
export const USER_COOKIE = "session_user";

export const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 60;
export const DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type TokenCookieOptions = {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
};

export function tokenCookieOptions(maxAge: number): TokenCookieOptions {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge,
    };
}

function decodeBase64Url(value: string): string {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        "=",
    );

    return atob(padded);
}

export function getJwtExpiresAtSeconds(token: string): number | null {
    const [, payload] = token.split(".");
    if (!payload) return null;

    try {
        const parsed = JSON.parse(decodeBase64Url(payload));
        return typeof parsed.exp === "number" ? parsed.exp : null;
    } catch {
        return null;
    }
}

export function shouldRefreshAccessToken(
    token: string,
    nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
    const expiresAt = getJwtExpiresAtSeconds(token);
    if (!expiresAt) return true;
    return expiresAt - nowSeconds <= ACCESS_TOKEN_REFRESH_SKEW_SECONDS;
}

export async function revokeRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken || !process.env.API_SERVER) return;

    try {
        await fetch(`${process.env.API_SERVER}/oauth/revoke`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ token: refreshToken }).toString(),
        });
    } catch {
        return;
    }
}
