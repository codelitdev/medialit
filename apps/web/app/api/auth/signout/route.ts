import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    USER_COOKIE,
    revokeRefreshToken,
} from "@/lib/oauth-session";

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    await revokeRefreshToken(cookieStore.get(REFRESH_TOKEN_COOKIE)?.value);
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    cookieStore.delete(USER_COOKIE);
    return NextResponse.redirect(new URL("/login", request.url));
}
export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    await revokeRefreshToken(cookieStore.get(REFRESH_TOKEN_COOKIE)?.value);
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    cookieStore.delete(USER_COOKIE);
    return NextResponse.redirect(new URL("/login", request.url));
}
