import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next-path";

function apiBase() {
    return (
        process.env.PUBLIC_API_URL ||
        process.env.API_SERVER ||
        "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
}

export function GET(request: NextRequest) {
    const webOrigin = (
        process.env.WEB_ORIGIN || request.nextUrl.origin
    ).replace(/\/$/, "");
    const nextPath = safeNextPath(
        request.nextUrl.searchParams.get("next"),
        webOrigin,
    );
    const returnTo = new URL(nextPath, webOrigin);
    const loginUrl = new URL("/login", apiBase());

    // The API owns the sign-in page and the OTP flow. Its hosted login page
    // validates this return URL against WEB_ORIGIN before redirecting back.
    loginUrl.searchParams.set("redirect", returnTo.toString());

    return NextResponse.redirect(loginUrl);
}
