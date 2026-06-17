"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    USER_COOKIE,
    revokeRefreshToken,
} from "@/lib/oauth-session";

export interface SessionUser {
    id: string;
    email: string;
    name?: string;
}

export interface Session {
    user: SessionUser;
    accessToken: string;
}

export async function auth(): Promise<Session | null> {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    const userJson = cookieStore.get(USER_COOKIE)?.value;

    if (!accessToken || !userJson) {
        return null;
    }

    try {
        const user = JSON.parse(userJson) as SessionUser;
        return {
            user,
            accessToken,
        };
    } catch {
        return null;
    }
}

export async function signOut() {
    const cookieStore = await cookies();
    await revokeRefreshToken(cookieStore.get(REFRESH_TOKEN_COOKIE)?.value);
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    cookieStore.delete(USER_COOKIE);
    redirect("/login");
}
