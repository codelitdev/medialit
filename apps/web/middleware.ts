import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    const accessToken = request.cookies.get("session_access_token")?.value;
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

    if (!accessToken && !isLoginPage && !isCallbackPage && !isSignoutPage) {
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    if (accessToken && isLoginPage) {
        url.pathname = "/";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!api/cleanup|_next/static|_next/image|favicon.ico|icon.svg).*)",
    ],
};
