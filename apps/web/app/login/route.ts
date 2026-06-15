import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: Request) {
    const cookieStore = await cookies();

    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");

    const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

    cookieStore.set("oauth_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
    });

    const origin = process.env.WEB_CLIENT || "http://localhost:3000";
    const redirectUri = `${origin}/api/auth/callback/medialit`;

    const authUrl =
        `${process.env.API_SERVER}/oauth/authorize?` +
        new URLSearchParams({
            response_type: "code",
            client_id: "web-client",
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            state: state,
        }).toString();

    return NextResponse.redirect(authUrl);
}
