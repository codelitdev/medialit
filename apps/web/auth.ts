"use server";

import { cookies } from "next/headers";
import { API_SERVER } from "@/lib/config";

export interface SessionUser {
    id: string;
    email: string;
    name?: string;
}

export interface Session {
    user: SessionUser;
}

export async function getSessionFromCookieHeader(
    cookieHeader: string,
    fetchImpl: typeof fetch = fetch,
): Promise<Session | null> {
    try {
        if (!cookieHeader) return null;
        const response = await fetchImpl(`${API_SERVER}/api/auth/get-session`, {
            headers: { Cookie: cookieHeader },
            cache: "no-store",
        });
        if (!response.ok) return null;
        const body = (await response.json()) as { user?: SessionUser };
        return body.user ? { user: body.user } : null;
    } catch {
        return null;
    }
}

export async function auth(): Promise<Session | null> {
    return getSessionFromCookieHeader((await cookies()).toString());
}
