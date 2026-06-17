import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
    ACCESS_TOKEN_COOKIE,
    DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS,
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    USER_COOKIE,
    shouldRefreshAccessToken,
    tokenCookieOptions,
} from "@/lib/oauth-session";

async function refreshSession(request: NextRequest) {
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    if (!refreshToken || !process.env.API_SERVER) return null;

    try {
        const tokenResponse = await fetch(
            `${process.env.API_SERVER}/oauth/token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                    client_id: "web-client",
                }).toString(),
            },
        );

        if (!tokenResponse.ok) return null;

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token || !tokenData.refresh_token) return null;

        return {
            accessToken: String(tokenData.access_token),
            refreshToken: String(tokenData.refresh_token),
            expiresIn:
                Number(tokenData.expires_in) ||
                DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS,
        };
    } catch {
        return null;
    }
}

function redirectToLogin(request: NextRequest) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    response.cookies.delete(USER_COOKIE);
    return response;
}

function setRefreshedTokenCookies(
    response: NextResponse,
    refreshed: {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    },
) {
    response.cookies.set(
        ACCESS_TOKEN_COOKIE,
        refreshed.accessToken,
        tokenCookieOptions(refreshed.expiresIn),
    );
    response.cookies.set(
        REFRESH_TOKEN_COOKIE,
        refreshed.refreshToken,
        tokenCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
    );
}

export async function middleware(request: NextRequest) {
    const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    const url = request.nextUrl.clone();

    const isLoginPage = url.pathname.startsWith("/login");
    const isCallbackPage = url.pathname.startsWith(
        "/api/auth/callback/medialit",
    );
    const isSignoutPage = url.pathname.startsWith("/api/auth/signout");
    const isStaticAsset =
        url.pathname.includes(".") ||
        url.pathname.startsWith("/_next") ||
        url.pathname.startsWith("/api/cleanup");

    if (isStaticAsset) {
        return NextResponse.next();
    }

    if (!accessToken && !isCallbackPage && !isSignoutPage) {
        if (refreshToken) {
            const refreshed = await refreshSession(request);
            if (refreshed) {
                if (isLoginPage) {
                    url.pathname = "/";
                    const response = NextResponse.redirect(url);
                    setRefreshedTokenCookies(response, refreshed);
                    return response;
                }

                const response = NextResponse.next();
                setRefreshedTokenCookies(response, refreshed);
                return response;
            }
        }

        if (!isLoginPage) {
            return redirectToLogin(request);
        }
    }

    if (accessToken && isLoginPage) {
        url.pathname = "/";
        return NextResponse.redirect(url);
    }

    if (
        accessToken &&
        !isLoginPage &&
        !isCallbackPage &&
        !isSignoutPage &&
        shouldRefreshAccessToken(accessToken)
    ) {
        const refreshed = await refreshSession(request);
        if (!refreshed) return redirectToLogin(request);

        const response = NextResponse.next();
        setRefreshedTokenCookies(response, refreshed);
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!api/cleanup|_next/static|_next/image|favicon.ico|icon.svg).*)",
    ],
};
