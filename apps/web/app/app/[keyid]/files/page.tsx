import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Files, Youtube } from "lucide-react";
import { auth } from "@/auth";
import { getCount, getMediaFiles } from "./actions";
import { getAppsDashboard } from "@/app/actions";
import { formatAppStorage, formatRelativeUpload } from "@/lib/media-format";
import type { MediaListItem } from "@/lib/media";
import MediaLibrary from "./media-library";
import UploadButton from "./upload-button";

const filesPerPage = 16;

export default async function Media(props: {
    params: Promise<{ keyid: string }>;
    searchParams: Promise<{
        page?: string;
        q?: string;
        kind?: string;
        sort?: string;
    }>;
}) {
    const [{ keyid }, searchParams, session] = await Promise.all([
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
    let appSummary: NonNullable<
        Awaited<ReturnType<typeof getAppsDashboard>>
    >["apps"][number];
    try {
        const [dashboard, filteredCount] = await Promise.all([
            getAppsDashboard(),
            getCount(keyid, filters),
        ]);
        const matchedApp = dashboard?.apps.find((app) => app.keyId === keyid);
        if (!matchedApp) throw new Error("Could not load app overview");
        appSummary = matchedApp;
        totalCount = filteredCount;
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
        medias = await getMediaFiles(keyid, page, filesPerPage, filters);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Could not load files";
        return (
            <div className="inline-error" role="alert">
                {message}
            </div>
        );
    }

    const firstResult = totalCount ? (page - 1) * filesPerPage + 1 : 0;
    const lastResult = Math.min(page * filesPerPage, totalCount);
    const pageHref = (nextPage: number) => {
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        if (kind) params.set("kind", kind);
        if (sort !== "newest") params.set("sort", sort);
        params.set("page", String(nextPage));
        return `/app/${keyid}/files?${params.toString()}`;
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
                        {appSummary.count}{" "}
                        {appSummary.count === 1 ? "file" : "files"} ·{" "}
                        {formatAppStorage(appSummary.storage)} · Last upload{" "}
                        {formatRelativeUpload(appSummary.lastUpload)}
                    </p>
                </div>
                <UploadButton keyid={keyid} />
            </div>

            {appSummary.count === 0 ? (
                <div className="empty-state">
                    <div>
                        <Files
                            className="empty-state-icon"
                            aria-hidden="true"
                        />
                        <h2>Upload your first file</h2>
                        <p>
                            Choose Upload to add an image, video, or document to
                            this library.
                        </p>
                        <div className="file-empty-actions">
                            <a
                                className="workspace-button secondary"
                                href="https://www.youtube.com/watch?v=QrYn82zK4es"
                                target="_blank"
                                rel="noreferrer"
                            >
                                <Youtube aria-hidden="true" />
                                Watch tutorial
                            </a>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <MediaLibrary
                        medias={medias}
                        keyid={keyid}
                        totalCount={appSummary.count}
                        globalCounts={{
                            Images: appSummary.images,
                            Videos: appSummary.videos,
                            PDFs: appSummary.pdfs,
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
