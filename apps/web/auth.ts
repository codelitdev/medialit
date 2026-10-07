"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBase } from "@/lib/server-api";

export interface SessionUser {
    id: string;
    email: string;
    name?: string;
}

export interface Session {
    user: SessionUser;
}

export async function auth(): Promise<Session | null> {
    const cookieStore = await cookies();
    const cookie = cookieStore.toString();
    if (!cookie.includes("session_token")) {
        return null;
    }

    const response = await fetch(`${apiBase()}/api/auth/get-session`, {
        headers: { cookie },
        cache: "no-store",
    });
    if (!response.ok) {
        return null;
    }

    const data = await response.json();
    if (!data?.user?.id || !data?.user?.email) {
        return null;
    }

    return {
        user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
        },
    };
}

export async function signOut() {
    const cookieStore = await cookies();
    await fetch(`${apiBase()}/api/auth/sign-out`, {
        method: "POST",
        headers: {
            cookie: cookieStore.toString(),
            "content-type": "application/json",
        },
        body: "{}",
        cache: "no-store",
    }).catch(() => undefined);

    for (const cookie of cookieStore.getAll()) {
        if (cookie.name.includes("medialit")) {
            cookieStore.delete(cookie.name);
        }
    }
    redirect("/login");
}
