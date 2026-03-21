import { source } from "@/lib/source";
import { getLLMText } from "@/lib/get-llm-text";

export const revalidate = false;

export async function GET(
    req: Request,
    _ctx: { params: Promise<Record<string, string | string[]>> },
) {
    const pathname = new URL(req.url).pathname;
    const relative = pathname.replace(/^\/+/, "").replace(/\.mdx$/, "");
    const slug = relative.length > 0 ? relative.split("/") : [];
    const normalizedSlug =
        slug.length === 1 && slug[0] === "index" ? undefined : slug;
    const page = source.getPage(normalizedSlug);

    if (!page) {
        return new Response("Not Found", { status: 404 });
    }

    return new Response(await getLLMText(page), {
        headers: {
            "Content-Type": "text/markdown; charset=utf-8",
        },
    });
}

export function generateStaticParams() {
    return source.generateParams().map((item) => ({
        slug: item.slug.length > 0 ? item.slug : ["index"],
    }));
}
