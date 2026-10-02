import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIES = [
    "medialit.session_token",
    "__Secure-medialit.session_token",
];

type SessionCheck = "valid" | "invalid" | "unavailable";

function apiBase() {
    return (
        process.env.API_SERVER ||
        process.env.PUBLIC_API_URL ||
        "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
}

function hasSessionCookie(request: NextRequest) {
    return SESSION_COOKIES.some((name) => request.cookies.get(name)?.value);
}

function clearSessionCookies(request: NextRequest, response: NextResponse) {
    for (const cookie of request.cookies.getAll()) {
        if (!cookie.name.includes("medialit")) continue;
        response.cookies.set(cookie.name, "", {
            path: "/",
            maxAge: 0,
            secure: cookie.name.startsWith("__Secure-"),
        });
    }
    return response;
}

// Cookie presence is not a session. A dead cookie used to send /login back
// to /, and the page redirect answered with a meta refresh, so the browser
// reloaded forever.
async function checkSession(request: NextRequest): Promise<SessionCheck> {
    try {
        const response = await fetch(`${apiBase()}/api/auth/get-session`, {
            headers: { cookie: request.headers.get("cookie") ?? "" },
            cache: "no-store",
        });
        if (!response.ok) {
            return response.status >= 500 ? "unavailable" : "invalid";
        }
        const data = await response.json();
        return data?.user?.id && data?.user?.email ? "valid" : "invalid";
    } catch {
        return "unavailable";
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isPublic =
        pathname.startsWith("/api/") ||
        pathname.startsWith("/payment/webhook") ||
        pathname.startsWith("/_next") ||
        pathname.includes(".");

    if (isPublic) {
        return NextResponse.next();
    }

    const check = hasSessionCookie(request)
        ? await checkSession(request)
        : "invalid";

    if (pathname.startsWith("/login")) {
        if (check === "valid") {
            return NextResponse.redirect(new URL("/", request.url));
        }
        const response = NextResponse.next();
        if (check === "invalid" && hasSessionCookie(request)) {
            clearSessionCookies(request, response);
        }
        return response;
    }

    if (check !== "valid") {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        const response = NextResponse.redirect(url);
        if (check === "invalid" && hasSessionCookie(request)) {
            clearSessionCookies(request, response);
        }
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!api/cleanup|_next/static|_next/image|favicon.ico|icon.svg).*)",
    ],
};
