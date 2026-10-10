"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Files, Folder, HardDrive, Search } from "lucide-react";
import NewApp from "@/components/new-app-button";
import type { AppsDashboardData } from "@/app/actions";
import { formatAppStorage, formatRelativeUpload } from "@/lib/media-format";

export default function AppsDashboard({ data }: { data: AppsDashboardData }) {
    const [query, setQuery] = useState("");
    const filteredApps = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return data.apps;
        return data.apps.filter((app) =>
            app.name.toLowerCase().includes(normalizedQuery),
        );
    }, [data.apps, query]);

    return (
        <>
            <div className="workspace-page-heading apps-dashboard-heading">
                <div>
                    <h1>All apps</h1>
                    <p>
                        {data.appCount} {data.appCount === 1 ? "app" : "apps"} ·{" "}
                        {data.totalFiles}{" "}
                        {data.totalFiles === 1 ? "file" : "files"} ·{" "}
                        {formatAppStorage(data.totalStorage)} stored
                    </p>
                </div>
                <div className="apps-dashboard-actions">
                    <label className="apps-search">
                        <Search aria-hidden="true" />
                        <span className="visually-hidden">Search apps</span>
                        <input
                            type="search"
                            aria-label="Search apps"
                            placeholder="Search apps"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                    <NewApp compact />
                </div>
            </div>

            <section className="apps-stats-grid" aria-label="Storage overview">
                <article className="apps-stat-card">
                    <div className="apps-stat-label">
                        <span>Storage used</span>
                        <HardDrive aria-hidden="true" />
                    </div>
                    <strong>{formatAppStorage(data.totalStorage)}</strong>
                    <p>
                        Across {data.appCount}{" "}
                        {data.appCount === 1 ? "app" : "apps"}
                    </p>
                </article>
                <article className="apps-stat-card">
                    <div className="apps-stat-label">
                        <span>Files</span>
                        <Files aria-hidden="true" />
                    </div>
                    <strong>{data.totalFiles}</strong>
                    <p>
                        {data.totalImages} images · {data.totalVideos} videos ·{" "}
                        {data.totalPdfs} PDFs
                    </p>
                </article>
                <article className="apps-stat-card">
                    <div className="apps-stat-label">
                        <span>Largest app</span>
                        <Folder aria-hidden="true" />
                    </div>
                    <strong className="apps-largest-name">
                        {data.largestApp?.name ?? "—"}
                    </strong>
                    <p>
                        {data.largestApp
                            ? `${formatAppStorage(data.largestApp.storage)} · ${data.largestApp.share}% of storage`
                            : "No apps yet"}
                    </p>
                </article>
            </section>

            <div className="apps-list-heading">
                <h2>Apps</h2>
                <span>Sorted by last upload</span>
            </div>
            <section className="apps-overview-grid" aria-label="Apps">
                {filteredApps.map((app) => (
                    <Link
                        key={app.keyId}
                        href={`/app/${app.keyId}/files`}
                        className="app-overview-card"
                    >
                        <span className="app-overview-top">
                            <span className="app-overview-icon">
                                <Folder aria-hidden="true" />
                            </span>
                            {app.default ? (
                                <span className="cl-badge cl-badge--default">
                                    Default
                                </span>
                            ) : null}
                        </span>
                        <strong className="app-overview-name">
                            {app.name || "Untitled app"}
                        </strong>
                        <span className="app-overview-detail">
                            {app.count} {app.count === 1 ? "file" : "files"} ·{" "}
                            {formatAppStorage(app.storage)}
                        </span>
                        <span className="app-overview-meter" aria-hidden="true">
                            <span style={{ width: `${app.share}%` }} />
                        </span>
                        <span className="app-overview-meta">
                            <span>
                                Last upload{" "}
                                {formatRelativeUpload(app.lastUpload)}
                            </span>
                            <span>{app.share}% of storage</span>
                        </span>
                    </Link>
                ))}
                {filteredApps.length === 0 ? (
                    <p className="apps-no-results" role="status">
                        {data.apps.length
                            ? "No apps match that search."
                            : "No apps yet. Create your first app to get started."}
                    </p>
                ) : null}
                <NewApp className="app-overview-new-card" />
            </section>
        </>
    );
}
