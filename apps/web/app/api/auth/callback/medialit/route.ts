import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    ACCESS_TOKEN_COOKIE,
    DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS,
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    USER_COOKIE,
    tokenCookieOptions,
} from "@/lib/oauth-session";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    const cookieStore = await cookies();
    const codeVerifier = cookieStore.get("oauth_code_verifier")?.value;

    if (!code || !codeVerifier) {
        return new NextResponse("Missing authorization code or verifier", {
            status: 400,
        });
    }

    const origin = process.env.WEB_CLIENT || "http://localhost:3000";
    const redirectUri = `${origin}/api/auth/callback/medialit`;

    try {
        const tokenResponse = await fetch(
            `${process.env.API_SERVER}/oauth/token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    code,
                    redirect_uri: redirectUri,
                    client_id: "web-client",
                    code_verifier: codeVerifier,
                }).toString(),
            },
        );

        if (!tokenResponse.ok) {
            const errBody = await tokenResponse.text();
            console.error("Token exchange failed:", errBody);
            return new NextResponse("Token exchange failed", { status: 400 });
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;

        if (!accessToken || !refreshToken) {
            return new NextResponse("No access or refresh token returned", {
                status: 400,
            });
        }

        const userinfoResponse = await fetch(
            `${process.env.API_SERVER}/oauth/userinfo`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        );

        if (!userinfoResponse.ok) {
            console.error("Failed to fetch UserInfo");
            return new NextResponse("UserInfo lookup failed", { status: 400 });
        }

        const userData = await userinfoResponse.json();

        cookieStore.set(
            ACCESS_TOKEN_COOKIE,
            accessToken,
            tokenCookieOptions(
                Number(tokenData.expires_in) ||
                    DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS,
            ),
        );
        cookieStore.set(
            REFRESH_TOKEN_COOKIE,
            refreshToken,
            tokenCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
        );

        cookieStore.set(
            USER_COOKIE,
            JSON.stringify({
                id: userData.sub,
                email: userData.email,
                name: userData.name,
            }),
            {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
            },
        );

        cookieStore.delete("oauth_code_verifier");

        return NextResponse.redirect(new URL("/", redirectUri));
    } catch (error: any) {
        console.error("OAuth callback error:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}
