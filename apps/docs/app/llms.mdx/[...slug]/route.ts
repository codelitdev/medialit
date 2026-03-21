import { source } from "@/lib/source";
import { getLLMText } from "@/lib/get-llm-text";

export const revalidate = false;

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string[] }> },
) {
    const { slug } = await params;
    const normalizedSlug =
        slug.length === 1 && slug[0] === "index" ? undefined : slug;
    const page = source.getPage(normalizedSlug);

    if (!page) {
        return new Response("Not Found", { status: 404 });
    }

    return new Response(await getLLMText(page), {
        headers: {
            "Content-Type": "text/markdown",
        },
    });
}

export function generateStaticParams() {
    return source.generateParams().map((item) => ({
        slug: item.slug.length > 0 ? item.slug : ["index"],
    }));
}
