import { redirect } from "next/navigation";
import { AlertTriangle, Database, KeyRound, Settings2 } from "lucide-react";
import { auth } from "@/auth";
import { getApp, getAppSummary, listApiKeys } from "@/app/actions";
import { formatAppStorage } from "@/lib/media-format";
import ApiKeysSection from "./api-keys-section";
import DeleteAppButton from "./delete-app-button";
import UpdateSettingsForm from "./update-settings-form";
import DefaultAppControl from "./default-app-control";

export default async function Settings(props: {
    params: Promise<{ appId: string }>;
}) {
    const [{ appId }, session] = await Promise.all([props.params, auth()]);
    if (!session) redirect("/login");

    const [app, appSummary, apiKeys] = await Promise.all([
        getApp(appId),
        getAppSummary(appId).catch(() => null),
        listApiKeys(appId).catch(() => null),
    ]);
    if (!app) redirect("/");

    if (!appSummary || !apiKeys) {
        return (
            <div className="inline-error" role="alert">
                Could not load this app’s settings.
            </div>
        );
    }

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <h1>App settings</h1>
                    <p>
                        Storage, API keys, and options for{" "}
                        {app.name || "this app"}.
                    </p>
                </div>
            </div>

            <div className="settings-stack">
                <section className="settings-card">
                    <div className="settings-card-title">
                        <span className="settings-card-icon">
                            <Database aria-hidden="true" />
                        </span>
                        <div>
                            <h2>Storage</h2>
                            <p className="settings-subtle">
                                File storage used by this app.
                            </p>
                        </div>
                    </div>
                    <div className="storage-value-row">
                        <strong>{formatAppStorage(appSummary.storage)}</strong>
                        <span>
                            {appSummary.count}{" "}
                            {appSummary.count === 1 ? "file" : "files"} ·{" "}
                            {appSummary.share}% of all your storage
                        </span>
                    </div>
                    <div className="storage-breakdown-list">
                        {[
                            ["Images", appSummary.imageStorage],
                            ["Videos", appSummary.videoStorage],
                            ["PDFs", appSummary.pdfStorage],
                            ["Other", appSummary.otherStorage],
                        ].map(([label, size]) => (
                            <div className="storage-breakdown-row" key={label}>
                                <span>{label}</span>
                                <strong>
                                    {formatAppStorage(Number(size))}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="settings-card">
                    <div className="settings-card-title">
                        <span className="settings-card-icon">
                            <KeyRound aria-hidden="true" />
                        </span>
                        <div>
                            <h2>API keys</h2>
                            <p className="settings-subtle">
                                Use a key with the MediaLit SDK or REST API.
                                Keep keys out of client-side code; browsers
                                upload with signatures instead.
                            </p>
                        </div>
                    </div>
                    <ApiKeysSection
                        appId={app.appId}
                        keys={apiKeys.items}
                        limit={apiKeys.limit}
                    />
                </section>

                <section className="settings-card">
                    <div className="settings-card-title">
                        <span className="settings-card-icon">
                            <Settings2 aria-hidden="true" />
                        </span>
                        <div>
                            <h2>General</h2>
                            <p className="settings-subtle">
                                Choose a name that helps you identify this media
                                library.
                            </p>
                        </div>
                    </div>
                    <UpdateSettingsForm
                        appId={app.appId}
                        name={app.name || ""}
                    />
                    <div className="settings-default-row">
                        <div>
                            <strong>Default app</strong>
                            <p className="settings-subtle">
                                Uploads from the dashboard and SDK calls without
                                an app go here.
                            </p>
                        </div>
                        <DefaultAppControl
                            appId={app.appId}
                            isDefault={app.default}
                        />
                    </div>
                </section>

                <section className="settings-card settings-card-danger">
                    <div className="settings-card-title">
                        <span className="settings-card-icon danger">
                            <AlertTriangle aria-hidden="true" />
                        </span>
                        <div>
                            <h2>Danger zone</h2>
                            <p className="settings-subtle">
                                Deleting this app removes its {appSummary.count}{" "}
                                {appSummary.count === 1 ? "file" : "files"} and
                                revokes its API keys.
                            </p>
                        </div>
                    </div>
                    <div className="settings-danger-action">
                        <p>This action cannot be undone.</p>
                        <DeleteAppButton
                            appName={app.name || "this app"}
                            appId={app.appId}
                        />
                    </div>
                </section>
            </div>
        </>
    );
}
