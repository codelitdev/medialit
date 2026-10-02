import { type NextRequest, NextResponse } from "next/server";
import { apiBase } from "@/lib/server-api";

async function proxy(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> },
) {
    const { path } = await context.params;
    const suffix = path.join("/");
    const target = `${apiBase()}/api/${suffix}${request.nextUrl.search}`;
    const headers = new Headers(request.headers);
    headers.delete("host");
    let body: BodyInit | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
            const form = await request.formData();
            body = JSON.stringify(Object.fromEntries(form.entries()));
            headers.set("content-type", "application/json");
            headers.delete("content-length");
        } else {
            body = await request.text();
        }
    }
    const response = await fetch(target, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
    });
    const outputHeaders = new Headers();
    for (const name of ["content-type", "location", "x-request-id"]) {
        const value = response.headers.get(name);
        if (value) outputHeaders.set(name, value);
    }
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
        outputHeaders.append("set-cookie", cookie);
    }
    if (setCookies.length === 0) {
        const rawSetCookie = response.headers.get("set-cookie");
        if (rawSetCookie) outputHeaders.append("set-cookie", rawSetCookie);
    }
    outputHeaders.set("cache-control", "no-store");
    return new NextResponse(response.body, {
        status: response.status,
        headers: outputHeaders,
    });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
