import { redirect } from "next/navigation";
import { AlertTriangle, Database, KeyRound, Settings2 } from "lucide-react";
import { auth } from "@/auth";
import { getApikeyUsingKeyId, getAppsDashboard } from "@/app/actions";
import { formatAppStorage } from "@/lib/media-format";
import ApiKeyControl from "./api-key-control";
import DeleteAppButton from "./delete-app-button";
import UpdateSettingsForm from "./update-settings-form";
import DefaultAppControl from "./default-app-control";

export default async function Settings(props: {
    params: Promise<{ keyid: string }>;
}) {
    const [{ keyid }, session] = await Promise.all([props.params, auth()]);
    if (!session) redirect("/login");

    const [apikey, dashboard] = await Promise.all([
        getApikeyUsingKeyId(keyid),
        getAppsDashboard(),
    ]);
    if (!apikey) redirect("/");

    const appSummary = dashboard?.apps.find((app) => app.keyId === keyid);
    if (!appSummary) {
        return (
            <div className="inline-error" role="alert">
                Could not load app storage details.
            </div>
        );
    }

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <h1>App settings</h1>
                    <p>
                        Storage, API key, and options for{" "}
                        {apikey.name || "this app"}.
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
                            <h2>API key</h2>
                            <p className="settings-subtle">
                                Use this key with the MediaLit SDK or REST API.
                                Keep it out of client-side code.
                            </p>
                        </div>
                    </div>
                    <div className="settings-field">
                        <label>API key</label>
                        <ApiKeyControl apiKey={apikey.key} />
                    </div>
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
                        keyId={apikey.keyId}
                        name={apikey.name || ""}
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
                            keyId={apikey.keyId}
                            isDefault={apikey.default}
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
                                revokes its API key.
                            </p>
                        </div>
                    </div>
                    <div className="settings-danger-action">
                        <p>This action cannot be undone.</p>
                        <DeleteAppButton
                            appName={apikey.name || "this app"}
                            keyId={apikey.keyId}
                        />
                    </div>
                </section>
            </div>
        </>
    );
}
