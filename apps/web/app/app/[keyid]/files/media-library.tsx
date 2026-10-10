"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Checkbox } from "@codelitdev/design-system";
import { Grid2X2, List, Search } from "lucide-react";
import type { MediaListItem } from "@/lib/media";
import FilePreview from "./file-preview";

type FileKind = "all" | "image" | "video" | "pdf" | "other";
type SortMode = "newest" | "oldest" | "name" | "largest";

const kindLabels: Record<FileKind, string> = {
    all: "All",
    image: "Images",
    video: "Videos",
    pdf: "PDFs",
    other: "Other",
};

export default function MediaLibrary({
    medias,
    keyid,
    totalCount,
    globalCounts,
    initialSearch,
    initialKind,
    initialSort,
}: {
    medias: MediaListItem[];
    keyid: string;
    totalCount: number;
    globalCounts: { Images: number; Videos: number; PDFs: number };
    initialSearch: string;
    initialKind: FileKind;
    initialSort: SortMode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [query, setQuery] = useState(initialSearch);
    const [kind, setKind] = useState<FileKind>(initialKind);
    const [sort, setSort] = useState<SortMode>(initialSort);
    const [layout, setLayout] = useState<"grid" | "list">("grid");
    const mediaSelectionKey = medias.map((media) => media.mediaId).join(":");
    const [selection, setSelection] = useState<{
        key: string;
        ids: Set<string>;
    }>(() => ({ key: mediaSelectionKey, ids: new Set() }));
    const selectedIds =
        selection.key === mediaSelectionKey ? selection.ids : new Set<string>();

    useEffect(() => setQuery(initialSearch), [initialSearch]);
    useEffect(() => setKind(initialKind), [initialKind]);
    useEffect(() => setSort(initialSort), [initialSort]);

    const navigateWithFilters = useCallback(
        (next: { search: string; kind: FileKind; sort: SortMode }) => {
            const params = new URLSearchParams();
            if (next.search.trim()) params.set("q", next.search.trim());
            if (next.kind !== "all") params.set("kind", next.kind);
            if (next.sort !== "newest") params.set("sort", next.sort);
            const queryString = params.toString();
            router.replace(
                queryString ? `${pathname}?${queryString}` : pathname,
                {
                    scroll: false,
                },
            );
        },
        [pathname, router],
    );

    useEffect(() => {
        if (query === initialSearch) return;
        const timeout = window.setTimeout(() => {
            navigateWithFilters({ search: query, kind, sort });
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [initialSearch, kind, navigateWithFilters, query, sort]);

    const counts: Record<FileKind, number> = {
        all: totalCount,
        image: globalCounts.Images,
        video: globalCounts.Videos,
        pdf: globalCounts.PDFs,
        other: Math.max(
            0,
            totalCount -
                globalCounts.Images -
                globalCounts.Videos -
                globalCounts.PDFs,
        ),
    };
    const filters = Object.keys(kindLabels) as FileKind[];
    const selectedCount = selectedIds.size;

    const filtered = medias;

    function toggleSelected(mediaId: string) {
        setSelection((current) => {
            const next = new Set(
                current.key === mediaSelectionKey ? current.ids : [],
            );
            if (next.has(mediaId)) next.delete(mediaId);
            else next.add(mediaId);
            return { key: mediaSelectionKey, ids: next };
        });
    }

    return (
        <>
            <div className="file-toolbar">
                <div className="file-toolbar-main">
                    <label className="file-search">
                        <Search aria-hidden="true" />
                        <input
                            type="search"
                            aria-label="Search files by name"
                            placeholder="Search files by name"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                    <div
                        className="filter-group"
                        role="group"
                        aria-label="Filter by file type"
                    >
                        {filters.map((filter) => (
                            <button
                                type="button"
                                key={filter}
                                className={`filter-chip${kind === filter ? " is-active" : ""}`}
                                aria-pressed={kind === filter}
                                onClick={() => {
                                    setKind(filter);
                                    navigateWithFilters({
                                        search: query,
                                        kind: filter,
                                        sort,
                                    });
                                }}
                            >
                                {kindLabels[filter]}
                                <span>{counts[filter]}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="file-toolbar-actions">
                    <label className="visually-hidden" htmlFor="file-sort">
                        Sort files
                    </label>
                    <select
                        id="file-sort"
                        className="file-sort"
                        value={sort}
                        onChange={(event) => {
                            const nextSort = event.target.value as SortMode;
                            setSort(nextSort);
                            navigateWithFilters({
                                search: query,
                                kind,
                                sort: nextSort,
                            });
                        }}
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="name">Name A–Z</option>
                        <option value="largest">Largest first</option>
                    </select>
                    <div
                        className="view-group"
                        role="group"
                        aria-label="File layout"
                    >
                        <button
                            type="button"
                            className={`view-chip${layout === "grid" ? " is-active" : ""}`}
                            aria-label="Grid view"
                            aria-pressed={layout === "grid"}
                            onClick={() => setLayout("grid")}
                        >
                            <Grid2X2 aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className={`view-chip${layout === "list" ? " is-active" : ""}`}
                            aria-label="List view"
                            aria-pressed={layout === "list"}
                            onClick={() => setLayout("list")}
                        >
                            <List aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>

            {selectedCount ? (
                <div className="file-selection-bar" role="status">
                    <strong>{selectedCount} selected</strong>
                    <button
                        type="button"
                        className="file-selection-clear"
                        onClick={() =>
                            setSelection({
                                key: mediaSelectionKey,
                                ids: new Set(),
                            })
                        }
                    >
                        Clear
                    </button>
                </div>
            ) : null}

            {filtered.length ? (
                <div className={layout === "grid" ? "file-grid" : "file-list"}>
                    {filtered.map((media) => (
                        <FilePreview
                            key={media.mediaId}
                            media={media}
                            keyid={keyid}
                            layout={layout}
                            selected={selectedIds.has(media.mediaId)}
                            onSelectionChange={() =>
                                toggleSelected(media.mediaId)
                            }
                        />
                    ))}
                </div>
            ) : (
                <div className="file-empty-filter" role="status">
                    No files match this search and filter.
                </div>
            )}
        </>
    );
}
