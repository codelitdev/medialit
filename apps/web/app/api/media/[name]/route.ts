import connectToDatabase from "@/lib/connect-db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { getUserFromSession } from "@/lib/user-handlers";
import { getApikeyFromName, getInternalApikey } from "@/lib/apikey-handlers";
import { getPaginatedMedia } from "@/lib/media-handlers";

export const GET = async (
    request: Request,
    { params }: { params: { name: string } }
) => {
    const name = params.name;

    await connectToDatabase();

    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const internalApikey = await getInternalApikey(dbUser._id);
    const apikey = await getApikeyFromName(dbUser._id, name);
    if (!apikey || !internalApikey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const media = await getPaginatedMedia({
        apikey: apikey!.key,
        internalApikey: internalApikey!.key,
    });

    return NextResponse.json(media);
};
