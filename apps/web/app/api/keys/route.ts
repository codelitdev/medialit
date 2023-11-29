import connectToDatabase from "@/lib/connect-db";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { createApiKey, getApiKeyByUserId } from "@/lib/apikey-handlers";
import { getUserFromSession } from "@/lib/user-handlers";

export const GET = async () => {
    await connectToDatabase();

    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apikeys = await getApiKeyByUserId(dbUser._id);
    return NextResponse.json(apikeys);
};

export const POST = async (request: NextRequest) => {
    await connectToDatabase();
    const { name } = await request.json();

    if (!name) {
        return NextResponse.json(
            { error: "Name is required" },
            { status: 400 }
        );
    }

    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apikey = await createApiKey(dbUser._id, name);
    return NextResponse.json({ key: apikey.key });
};
