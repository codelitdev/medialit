"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
    const accessToken = cookieStore.get("session_access_token")?.value;
    const userJson = cookieStore.get("session_user")?.value;

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
    cookieStore.delete("session_access_token");
    cookieStore.delete("session_user");
    redirect("/login");
}
