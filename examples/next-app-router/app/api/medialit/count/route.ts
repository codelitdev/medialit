import { MediaLit } from "medialit";

const client = new MediaLit();

export async function GET(request: Request) {
    try {
        const count = await client.getCount();
        return Response.json({ count });
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
