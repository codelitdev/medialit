export const dynamic = "auto";

import { getApikeyFromKeyId } from "@/lib/apikey-handlers";
import { auth } from "@/auth";
import { getMediaLitClient } from "@/lib/get-medialit-client";

export async function POST(request: Request) {
    const { mediaId, keyId } = await request.json();

    if (!mediaId || !keyId) {
        return Response.json({}, { status: 400 });
    }

    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthenticated");
    }

    const apikey = await getApikeyFromKeyId(keyId);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const client = getMediaLitClient(apikey.key);

    const media = await client.get(mediaId);

    return Response.json({ media });
}
