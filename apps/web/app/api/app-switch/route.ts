import { NextRequest, NextResponse } from "next/server";
import { CURRENT_APP_COOKIE } from "@/lib/current-app-cookie";

// Sets which app the dashboard is "in" — a plain cookie (not a secret; every
// server action re-derives the actual Apikey from the authenticated session
// regardless of what this says). Submitted as a regular form POST so
// switching works with a plain <form>, no client JS required.
export async function POST(request: NextRequest) {
    const form = await request.formData();
    const keyId = String(form.get("keyId") || "");

    // 303: after a form POST, follow the redirect with GET (not re-POST).
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    if (keyId) {
        response.cookies.set(CURRENT_APP_COOKIE, keyId, {
            httpOnly: false,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
        });
    }
    return response;
}
