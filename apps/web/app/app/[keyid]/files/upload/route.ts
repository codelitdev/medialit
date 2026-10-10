import { serverApi } from "@/lib/server-api";

export async function POST(
    request: Request,
    context: { params: Promise<{ keyid: string }> },
) {
    const { keyid } = await context.params;
    const appResponse = await serverApi(
        `/api/apps/${encodeURIComponent(keyid)}`,
    );
    if (!appResponse.ok) {
        const data = await appResponse.json().catch(() => ({}));
        return Response.json(
            { error: data.error || "Could not load app settings" },
            { status: appResponse.status },
        );
    }

    const app = await appResponse.json();
    const response = await serverApi("/api/media/create", {
        method: "POST",
        headers: { "x-medialit-apikey": app.key },
        body: await request.formData(),
    });
    const data = await response.json().catch(() => ({}));
    return Response.json(data, { status: response.status });
}
