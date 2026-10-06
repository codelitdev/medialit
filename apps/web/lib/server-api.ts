import { cookies } from "next/headers";

export function apiBase() {
    return (
        process.env.API_SERVER ||
        process.env.PUBLIC_API_URL ||
        "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
}

export async function serverApi(path: string, init?: RequestInit) {
    const cookieStore = await cookies();
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookieStore.toString());
    if (init?.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
    }
    return fetch(`${apiBase()}${path}`, {
        ...init,
        headers,
        cache: "no-store",
    });
}
