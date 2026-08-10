import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CURRENT_APP_COOKIE } from "./current-app-cookie";

export async function resolveCurrentKeyId(
    apiKeys: { keyId: string; default?: boolean }[],
): Promise<string | null> {
    if (apiKeys.length === 0) return null;

    const cookieStore = await cookies();
    const cookieKeyId = cookieStore.get(CURRENT_APP_COOKIE)?.value;
    if (cookieKeyId && apiKeys.some((key) => key.keyId === cookieKeyId)) {
        return cookieKeyId;
    }

    return apiKeys.find((key) => key.default)?.keyId ?? apiKeys[0].keyId;
}

// Legacy deep link — the dashboard now lives at "/" and shows whichever app
// is selected via the sidebar switcher. Keep old /app/[keyid]/* bookmarks
// working by switching to that app and redirecting home.
export function redirectToAppHome(
    keyid: string,
    request: NextRequest,
    tab?: "files" | "settings",
) {
    const url = new URL("/", request.url);
    if (tab === "settings") url.searchParams.set("tab", "settings");
    const response = NextResponse.redirect(url);
    response.cookies.set(CURRENT_APP_COOKIE, keyid, {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    });
    return response;
}
