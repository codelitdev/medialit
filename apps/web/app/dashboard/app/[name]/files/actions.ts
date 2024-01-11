import connectToDatabase from "@/lib/connect-db";
import { getUserFromSession } from "@/lib/user-handlers";
import { getApikeyFromName, getInternalApikey } from "@/lib/apikey-handlers";
import { getPaginatedMedia } from "@/lib/media-handlers";
import { auth } from "@/auth";

export async function getMediaFiles(name: string, page: number) {
    if (!name) {
        return;
    }

    const session = await auth();
    if (!session || !session.user) {
        return;
    }

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return;
    }

    const internalApikey = await getInternalApikey(dbUser._id);
    const apikey = await getApikeyFromName(dbUser._id, name);

    if (!apikey || !internalApikey) {
        return;
    }

    const media = await getPaginatedMedia({
        apikey: apikey!.key,
        internalApikey: internalApikey!.key,
        page: page || 1,
    });

    return media;
}
