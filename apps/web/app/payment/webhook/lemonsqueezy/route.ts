import { apiBase } from "@/lib/server-api";

export async function GET() {
    return Response.json({ success: true });
}

export async function POST(request: Request) {
    const body = await request.text();
    const response = await fetch(`${apiBase()}/payment/webhook/lemonsqueezy`, {
        method: "POST",
        headers: {
            "content-type":
                request.headers.get("content-type") || "application/json",
            "x-signature": request.headers.get("x-signature") || "",
        },
        body,
    });
    const text = await response.text();
    return new Response(text, {
        status: response.status,
        headers: { "content-type": "application/json" },
    });
}
