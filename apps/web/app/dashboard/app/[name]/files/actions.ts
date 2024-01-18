import connectToDatabase from "@/lib/connect-db";
import { getUserFromSession } from "@/lib/user-handlers";
import { getApikeyFromName, getInternalApikey } from "@/lib/apikey-handlers";
import { getPaginatedMedia } from "@/lib/media-handlers";
import { auth } from "@/auth";
import { Media } from "@medialit/models";

export async function getMediaFiles(
    name: string,
    page: number
): Promise<Media[]> {
    if (!name) {
        throw new Error("Name is required");
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
        console.error("Internal apikey not found for user", dbUser._id); // eslint-disable-line no-console
        throw new Error("We messed up. Please try again later.");
    }
    const decodedName = decodeURI(name);
    const apikey = await getApikeyFromName(dbUser._id, decodedName);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const media = await getPaginatedMedia({
        apikey: apikey.key,
        internalApikey: internalApikey.key,
        page: page || 1,
    });

    return media;
}
