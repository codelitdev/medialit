import { apiBase } from "@/lib/server-api";

export async function POST(request: Request) {
    const body = await request.text();
    const headers = new Headers();
    headers.set(
        "content-type",
        request.headers.get("content-type") || "application/json",
    );
    for (const name of [
        "webhook-id",
        "webhook-timestamp",
        "webhook-signature",
    ]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    const response = await fetch(`${apiBase()}/webhooks/billing/dodo`, {
        method: "POST",
        headers,
        body,
    });
    const text = await response.text();
    return new Response(text, {
        status: response.status,
        headers: { "content-type": "application/json" },
    });
}
