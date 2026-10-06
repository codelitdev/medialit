import { cookies } from "next/headers";
import { apiBase } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const { mediaId, keyId } = await request.json();
    if (!mediaId || !keyId) {
        return Response.json({}, { status: 400 });
    }

    const cookieStore = await cookies();
    const response = await fetch(
        `${apiBase()}/api/apps/${encodeURIComponent(keyId)}/media/${encodeURIComponent(mediaId)}`,
        {
            headers: { cookie: cookieStore.toString() },
            cache: "no-store",
        },
    );
    if (!response.ok) {
        return Response.json({}, { status: response.status });
    }
    const media = await response.json();
    return Response.json({ media });
}
