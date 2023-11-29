import connectToDatabase from "@/lib/connect-db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { getUserFromSession } from "@/lib/user-handlers";
import { getApikeyFromName, getInternalApikey } from "@/lib/apikey-handlers";
import { getPaginatedMedia } from "@/lib/media-handlers";
import { type NextRequest } from "next/server";

export const GET = async (
    request: NextRequest,
    { params }: { params: { name: string } }
) => {
    const name = params.name;
    const searchParams = request.nextUrl.searchParams;
    const page = searchParams.get("page");
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
        page: page ? +page : 1,
    });

    return NextResponse.json(media);
};
