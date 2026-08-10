import { NextRequest, NextResponse } from "next/server";
import { API_SERVER, WEB_CLIENT } from "@/lib/config";

async function proxyAuth(req: NextRequest, path: string[]) {
    const upstreamUrl = new URL(
        `/api/auth/${path.map(encodeURIComponent).join("/")}`,
        API_SERVER,
    );
    req.nextUrl.searchParams.forEach((value, key) => {
        upstreamUrl.searchParams.append(key, value);
    });

    const headers = new Headers(req.headers);
    headers.set("host", upstreamUrl.host);
    headers.set("x-forwarded-host", req.headers.get("host") || "");
    headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));

    const body =
        req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await req.arrayBuffer();
    const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body,
        redirect: "manual",
    });

    const responseHeaders = new Headers(upstream.headers);
    const location = responseHeaders.get("location");
    if (location?.startsWith(API_SERVER)) {
        responseHeaders.set(
            "location",
            location.replace(API_SERVER, WEB_CLIENT),
        );
    }

    if (
        req.method === "POST" &&
        path.length === 1 &&
        path[0] === "sign-out" &&
        upstream.ok
    ) {
        const response = NextResponse.redirect(new URL("/login", WEB_CLIENT), {
            status: 303,
        });
        for (const cookie of upstream.headers.getSetCookie()) {
            response.headers.append("set-cookie", cookie);
        }
        return response;
    }

    return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ path: string[] }> },
) {
    return proxyAuth(req, (await ctx.params).path);
}

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ path: string[] }> },
) {
    return proxyAuth(req, (await ctx.params).path);
}

export async function PUT(
    req: NextRequest,
    ctx: { params: Promise<{ path: string[] }> },
) {
    return proxyAuth(req, (await ctx.params).path);
}

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ path: string[] }> },
) {
    return proxyAuth(req, (await ctx.params).path);
}

export async function DELETE(
    req: NextRequest,
    ctx: { params: Promise<{ path: string[] }> },
) {
    return proxyAuth(req, (await ctx.params).path);
}
