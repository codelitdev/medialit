import { MediaLit } from "medialit";

const client = new MediaLit();
const endpoint = process.env.MEDIALIT_ENDPOINT || "https://api.medialit.cloud";

export async function POST() {
    try {
        // Get presigned URL from SDK - it returns the full URL
        const presignedUrl = await client.getPresignedUploadUrl();

        // Extract signature from the URL (URL format: http://host/media/create?signature=xxx)
        const url = new URL(presignedUrl);
        const signature = url.searchParams.get("signature");

        if (!signature) {
            return Response.json(
                { error: "Failed to extract signature from URL" },
                { status: 500 },
            );
        }

        return Response.json({ signature, endpoint });
    } catch (error) {
        if (error instanceof Error) {
            console.log("Error getting presigned signature:", error);
            return Response.json({ error: error.message }, { status: 500 });
        }
        return Response.json(
            { error: "An unknown error occurred" },
            { status: 500 },
        );
    }
}
