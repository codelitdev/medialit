import { NextRequest } from "next/server";
import { MediaLit } from "medialit";

const client = new MediaLit();

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mediaId = searchParams.get("mediaId");

    if (!mediaId) {
        return Response.json(
            { error: "Media ID is required" },
            { status: 400 },
        );
    }

    try {
        const media = await client.get(mediaId);
        return Response.json(media);
    } catch (error) {
        if (error instanceof Error) {
            return Response.json({ error: error.message }, { status: 500 });
        }
        return Response.json(
            { error: "An unknown error occurred" },
            { status: 500 },
        );
    }
}

export async function POST() {
    try {
        const presignedUrl = await client.getPresignedUploadUrl();
        return Response.json({ presignedUrl });
    } catch (error) {
        if (error instanceof Error) {
            console.log("Error getting presigned URL:", error);
            return Response.json({ error: error.message }, { status: 500 });
        }
        return Response.json(
            { error: "An unknown error occurred" },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mediaId = searchParams.get("mediaId");

    if (!mediaId) {
        return Response.json(
            { error: "Media ID is required" },
            { status: 400 },
        );
    }

    try {
        await client.delete(mediaId);
        return Response.json({ success: true });
    } catch (error) {
        if (error instanceof Error) {
            return Response.json({ error: error.message }, { status: 500 });
        }
        return Response.json(
            { error: "An unknown error occurred" },
            { status: 500 },
        );
    }
}
