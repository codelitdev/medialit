export const dynamic = "auto";

import connectToDatabase from "@/lib/connect-db";
import { getUserFromSession } from "@/lib/user-handlers";
import { getApikeyFromKeyId, getInternalApikey } from "@/lib/apikey-handlers";
import { getMedia as getMediaFromServer } from "@/lib/media-handlers";
import { auth } from "@/auth";

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

    const internalApikey = await getInternalApikey(dbUser._id);

    if (!internalApikey) {
        console.error("Internal apikey not found for user", dbUser._id);
        throw new Error("We messed up. Please try again later.");
    }
    const apikey = await getApikeyFromKeyId(dbUser._id, keyId);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const media = await getMediaFromServer({
        mediaId: mediaId,
        apikey: apikey.key,
        internalApikey: internalApikey.key,
    });

    return Response.json({ media });
}
