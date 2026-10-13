"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
    ArrowUpDown,
    Check,
    ChevronDown,
    Grid2X2,
    List,
    Search,
    Trash2,
} from "lucide-react";
import type { MediaListItem } from "@/lib/media";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@codelitdev/design-system";
import FilePreview, { FileTableRow } from "./file-preview";

type FileKind = "all" | "image" | "video" | "pdf" | "other";
type SortMode = "newest" | "oldest" | "name" | "largest";

const sortLabels: Record<SortMode, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    name: "Name A–Z",
    largest: "Largest first",
};

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
    globalCounts: Record<Exclude<FileKind, "all">, number>;
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
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
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
        ...globalCounts,
    };
    const filters = Object.keys(kindLabels) as FileKind[];
    const selectedCount = selectedIds.size;

    const filtered = medias;

    const allSelected =
        filtered.length > 0 &&
        filtered.every((media) => selectedIds.has(media.mediaId));

    function toggleAll() {
        setSelection({
            key: mediaSelectionKey,
            ids: allSelected
                ? new Set()
                : new Set(filtered.map((media) => media.mediaId)),
        });
    }

    async function deleteSelected() {
        setDeleting(true);
        try {
            const response = await fetch(
                `/api/apps/${encodeURIComponent(keyid)}/media/delete`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mediaIds: Array.from(selectedIds) }),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    data.error || "Could not delete the selected files",
                );
            }

            if (data.failed) {
                toast.error("Some files could not be deleted", {
                    description: `${data.deleted} deleted, ${data.failed} failed`,
                });
            } else {
                toast.success("Deleted", {
                    description: `${data.deleted} ${data.deleted === 1 ? "file" : "files"} deleted`,
                });
            }
            setSelection({ key: mediaSelectionKey, ids: new Set() });
            setConfirmDeleteOpen(false);
            router.refresh();
        } catch (deleteError) {
            toast.error("Uh oh!", {
                description:
                    deleteError instanceof Error
                        ? deleteError.message
                        : "Could not delete the selected files",
            });
        } finally {
            setDeleting(false);
        }
    }

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
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                id="file-sort"
                                type="button"
                                className="file-sort"
                                aria-label={`Sort files: ${sortLabels[sort]}`}
                            >
                                <ArrowUpDown aria-hidden="true" />
                                <span>{sortLabels[sort]}</span>
                                <ChevronDown aria-hidden="true" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            className="file-sort-menu"
                        >
                            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={sort}
                                onValueChange={(value) => {
                                    const nextSort = value as SortMode;
                                    setSort(nextSort);
                                    navigateWithFilters({
                                        search: query,
                                        kind,
                                        sort: nextSort,
                                    });
                                }}
                            >
                                {(Object.keys(sortLabels) as SortMode[]).map(
                                    (option) => (
                                        <DropdownMenuRadioItem
                                            key={option}
                                            value={option}
                                            className="file-sort-item"
                                        >
                                            {sortLabels[option]}
                                            {sort === option ? (
                                                <Check
                                                    aria-hidden="true"
                                                    className="file-sort-check"
                                                />
                                            ) : null}
                                        </DropdownMenuRadioItem>
                                    ),
                                )}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
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
                <div className="file-bulk-bar" role="status">
                    <strong>{selectedCount} selected</strong>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            setSelection({
                                key: mediaSelectionKey,
                                ids: new Set(),
                            })
                        }
                    >
                        Clear
                    </Button>
                    <div className="file-bulk-actions">
                        <Button
                            variant="destructive"
                            onClick={() => setConfirmDeleteOpen(true)}
                        >
                            <Trash2 aria-hidden="true" />
                            Delete
                        </Button>
                    </div>
                </div>
            ) : null}

            <Dialog
                open={confirmDeleteOpen}
                onOpenChange={(open) => {
                    if (!deleting) setConfirmDeleteOpen(open);
                }}
            >
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>
                            Delete {selectedCount}{" "}
                            {selectedCount === 1 ? "file" : "files"}?
                        </DialogTitle>
                        <DialogDescription>
                            This permanently removes the selected files from
                            storage. This can’t be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmDeleteOpen(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={deleteSelected}
                            disabled={deleting}
                        >
                            {deleting ? "Deleting…" : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {filtered.length && layout === "list" ? (
                <div className="file-table-box">
                    <table className="file-table">
                        <thead>
                            <tr>
                                <th className="file-table-check">
                                    <Checkbox
                                        checked={allSelected}
                                        label={
                                            <span className="visually-hidden">
                                                Select all files
                                            </span>
                                        }
                                        onChange={toggleAll}
                                    />
                                </th>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Size</th>
                                <th>Uploaded</th>
                                <th>Access</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((media) => (
                                <FileTableRow
                                    key={media.mediaId}
                                    media={media}
                                    keyid={keyid}
                                    selected={selectedIds.has(media.mediaId)}
                                    onSelectionChange={() =>
                                        toggleSelected(media.mediaId)
                                    }
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : filtered.length ? (
                <div className="file-grid">
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
