import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

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
        // 1. Exchange authorization code for token
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

        if (!accessToken) {
            return new NextResponse("No access token returned", {
                status: 400,
            });
        }

        // 2. Fetch UserInfo
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

        // 3. Set cookies and redirect
        cookieStore.set("session_access_token", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
        });

        cookieStore.set(
            "session_user",
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
