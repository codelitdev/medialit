import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { getCount, getMediaFiles } from "./actions";
import { getAppSummary, type AppSummary } from "@/app/actions";
import { cliNeedsEndpoint, getPublicApiBase } from "@/lib/api-base";
import { formatAppStorage, formatLastUpload } from "@/lib/media-format";
import type { MediaListItem } from "@/lib/media";
import MediaLibrary from "./media-library";
import UploadButton from "./upload-button";
import EmptyFiles from "./empty-files";

const filesPerPage = 16;

export default async function Media(props: {
    params: Promise<{ appId: string }>;
    searchParams: Promise<{
        page?: string;
        q?: string;
        kind?: string;
        sort?: string;
    }>;
}) {
    const [{ appId }, searchParams, session] = await Promise.all([
        props.params,
        props.searchParams,
        auth(),
    ]);
    if (!session) redirect("/login");

    const requestedPage = Number.parseInt(searchParams.page ?? "1", 10);
    const safeRequestedPage =
        Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const search = (searchParams.q ?? "").trim().slice(0, 200);
    const kind = ["image", "video", "pdf", "other"].includes(
        searchParams.kind ?? "",
    )
        ? (searchParams.kind as "image" | "video" | "pdf" | "other")
        : undefined;
    const sort = ["newest", "oldest", "name", "largest"].includes(
        searchParams.sort ?? "",
    )
        ? (searchParams.sort as "newest" | "oldest" | "name" | "largest")
        : "newest";
    const filters = { search, kind, sort };

    let totalCount: number;
    let appSummary: AppSummary;
    try {
        [appSummary, totalCount] = await Promise.all([
            getAppSummary(appId),
            getCount(appId, filters),
        ]);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Could not load files";
        return (
            <div className="inline-error" role="alert">
                {message}
            </div>
        );
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / filesPerPage));
    const page = Math.min(safeRequestedPage, totalPages);
    let medias: MediaListItem[];
    try {
        medias = await getMediaFiles(appId, page, filesPerPage, filters);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Could not load files";
        return (
            <div className="inline-error" role="alert">
                {message}
            </div>
        );
    }

    const apiBase = getPublicApiBase(await headers());
    const includeCliEndpoint = cliNeedsEndpoint(apiBase);

    const firstResult = totalCount ? (page - 1) * filesPerPage + 1 : 0;
    const lastResult = Math.min(page * filesPerPage, totalCount);
    const pageHref = (nextPage: number) => {
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        if (kind) params.set("kind", kind);
        if (sort !== "newest") params.set("sort", sort);
        params.set("page", String(nextPage));
        return `/app/${appId}/files?${params.toString()}`;
    };

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <div className="files-title-row">
                        <h1>Files</h1>
                        {appSummary.default ? (
                            <span className="cl-badge cl-badge--default">
                                Default app
                            </span>
                        ) : null}
                    </div>
                    <p>
                        {appSummary.count === 0
                            ? "No files yet"
                            : `${appSummary.count} ${appSummary.count === 1 ? "file" : "files"} · ${formatAppStorage(appSummary.storage)} · ${formatLastUpload(appSummary.lastUpload)}`}
                    </p>
                </div>
                <UploadButton appId={appId} />
            </div>

            {appSummary.count === 0 ? (
                <EmptyFiles
                    appId={appId}
                    appName={appSummary.name || "this app"}
                    serverUrl={`${apiBase}/mcp`}
                    apiEndpoint={apiBase}
                    includeCliEndpoint={includeCliEndpoint}
                />
            ) : (
                <>
                    <MediaLibrary
                        medias={medias}
                        appId={appId}
                        totalCount={appSummary.count}
                        globalCounts={{
                            image: appSummary.images,
                            video: appSummary.videos,
                            pdf: appSummary.pdfs,
                            other: appSummary.others,
                        }}
                        initialSearch={search}
                        initialKind={kind ?? "all"}
                        initialSort={sort}
                    />
                    <div className="file-pagination">
                        <span>
                            {totalCount
                                ? `Showing ${firstResult}–${lastResult} of ${totalCount} files`
                                : "No files match this search and filter"}
                        </span>
                        <div className="file-pagination-actions">
                            <Link
                                className="pager-button"
                                href={pageHref(Math.max(1, page - 1))}
                                aria-disabled={page <= 1}
                            >
                                <ArrowLeft aria-hidden="true" />
                                Previous
                            </Link>
                            <span className="pager-button" aria-current="page">
                                {page} / {totalPages}
                            </span>
                            <Link
                                className="pager-button"
                                href={pageHref(Math.min(totalPages, page + 1))}
                                aria-disabled={page >= totalPages}
                            >
                                Next
                                <ArrowRight aria-hidden="true" />
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
