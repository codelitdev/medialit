import { NextResponse } from "next/server";
import { API_PUBLIC_URL, WEB_CLIENT } from "@/lib/config";

export function GET(request: Request) {
    // `/oauth/login` is exclusively for Better Auth's signed OAuth
    // authorization context. Dashboard sign-in uses oauth-server-kit's plain
    // `/login` route, which safely validates this redirect itself.
    const target = new URL("/login", API_PUBLIC_URL);
    target.searchParams.set("redirect", new URL("/", WEB_CLIENT).toString());
    return NextResponse.redirect(target);
}
