import { MediaLit } from "medialit";

const client = new MediaLit();

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const media = await client.get(id);
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
