export const dynamic = "auto";

import connectToDatabase from "@/lib/connect-db";
import { getUserFromSession } from "@/lib/user-handlers";
import { getApikeyByUserId } from "@/lib/apikey-handlers";
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

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        throw new Error("User not found");
    }

    const apikey = await getApikeyByUserId({ userId: dbUser._id, keyId });

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const client = getMediaLitClient(apikey.key);

    const media = await client.get(mediaId);

    return Response.json({ media });
}
