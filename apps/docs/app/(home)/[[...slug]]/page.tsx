import { source } from "@/lib/source";
import {
    DocsPage,
    DocsBody,
    DocsDescription,
    DocsTitle,
} from "fumadocs-ui/page";
import { notFound, redirect } from "next/navigation";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { getMDXComponents } from "@/mdx-components";
import { APIPage } from "@/components/api-page";
import { PageActions } from "@/components/page-actions";

export default async function Page(props: {
    params: Promise<{ slug?: string[] }>;
}) {
    const params = await props.params;
    const slugPath = params.slug?.join("/");

    if (slugPath?.endsWith(".mdx")) {
        const markdownSlug = slugPath.slice(0, -4);
        redirect(`/llms.mdx/${markdownSlug || "index"}`);
    }

    if (slugPath === "rest-api" || slugPath === "api-reference") {
        redirect("/api/uploadMedia");
    }

    const page = source.getPage(params.slug);
    if (!page) notFound();

    if (page.data.type === "openapi") {
        return (
            <DocsPage full>
                <DocsTitle>{page.data.title}</DocsTitle>
                <DocsDescription>{page.data.description}</DocsDescription>
                <DocsBody>
                    <APIPage {...page.data.getAPIPageProps()} />
                </DocsBody>
            </DocsPage>
        );
    }

    const MDXContent = page.data.body;
    const markdownUrl = `${page.url === "/" ? "/index" : page.url}.mdx`;
    const githubBaseUrl =
        process.env.NEXT_PUBLIC_DOCS_GITHUB_BASE_URL ||
        "https://github.com/codelitdev/medialit/blob/main/apps/docs/content/docs";
    const githubUrl = `${githubBaseUrl.replace(/\/$/, "")}/${page.path}`;

    return (
        <DocsPage toc={page.data.toc} full={page.data.full}>
            <DocsTitle>{page.data.title}</DocsTitle>
            <DocsDescription className="mb-4">
                {page.data.description}
            </DocsDescription>
            <PageActions markdownUrl={markdownUrl} githubUrl={githubUrl} />
            <DocsBody>
                <MDXContent
                    components={getMDXComponents({
                        // this allows you to link to other pages with relative file paths
                        a: createRelativeLink(source, page),
                    })}
                />
            </DocsBody>
        </DocsPage>
    );
}

export async function generateStaticParams() {
    const params = source.generateParams();

    return [...params, { slug: ["rest-api"] }, { slug: ["api-reference"] }];
}

export async function generateMetadata(props: {
    params: Promise<{ slug?: string[] }>;
}) {
    const params = await props.params;
    const page = source.getPage(params.slug);
    if (!page) notFound();

    return {
        title: page.data.title,
        description: page.data.description,
    };
}
