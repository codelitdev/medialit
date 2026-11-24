import { redirect } from "next/navigation";
import {
    AlertTriangle,
    Database,
    Film,
    History,
    KeyRound,
    Settings2,
    Webhook,
} from "lucide-react";
import { auth } from "@/auth";
import {
    getApp,
    getAppSummary,
    getMediaSettings,
    getProcessingMinutes,
    getSubscriber,
    listApiKeys,
    listWebhooks,
} from "@/app/actions";
import {
    ImageOptimizationCard,
    VideoStreamingCard,
} from "./media-settings-section";
import { formatAppStorage } from "@/lib/media-format";
import ApiKeysSection from "./api-keys-section";
import DeleteAppButton from "./delete-app-button";
import UpdateSettingsForm from "./update-settings-form";
import DefaultAppControl from "./default-app-control";
import WebhooksSection from "./webhooks-section";
import DeliveriesTable from "./deliveries-table";
import SettingsTabs from "./settings-tabs";
import { SettingsCard } from "@/components/settings-card";

export default async function Settings(props: {
    params: Promise<{ appId: string }>;
}) {
    const [{ appId }, session] = await Promise.all([props.params, auth()]);
    if (!session) redirect("/login");

    const [
        app,
        appSummary,
        apiKeys,
        webhooks,
        mediaSettings,
        minutes,
        subscriber,
    ] = await Promise.all([
        getApp(appId),
        getAppSummary(appId).catch(() => null),
        listApiKeys(appId).catch(() => null),
        listWebhooks(appId).catch(() => null),
        getMediaSettings(appId).catch(() => null),
        getProcessingMinutes(appId).catch(() => null),
        getSubscriber().catch(() => null),
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
                        Storage, API keys, media processing, webhooks, and
                        options for {app.name || "this app"}.
                    </p>
                </div>
            </div>

            <SettingsTabs
                tabs={[
                    {
                        value: "general",
                        label: "General",
                        icon: <Settings2 aria-hidden="true" />,
                        content: (
                            <>
                                <SettingsCard
                                    icon={<Settings2 aria-hidden="true" />}
                                    title="General"
                                    description="Choose a name that helps you identify this media library."
                                >
                                    <UpdateSettingsForm
                                        appId={app.appId}
                                        name={app.name || ""}
                                    />
                                    <div className="settings-default-row">
                                        <div>
                                            <strong>Default app</strong>
                                            <p className="settings-subtle">
                                                Uploads from the dashboard and
                                                SDK calls without an app go
                                                here.
                                            </p>
                                        </div>
                                        <DefaultAppControl
                                            appId={app.appId}
                                            isDefault={app.default}
                                        />
                                    </div>
                                </SettingsCard>
                                <SettingsCard
                                    icon={<Database aria-hidden="true" />}
                                    title="Storage"
                                    description="File storage used by this app."
                                >
                                    <div className="storage-value-row">
                                        <strong>
                                            {formatAppStorage(
                                                appSummary.storage,
                                            )}
                                        </strong>
                                        <span>
                                            {appSummary.count}{" "}
                                            {appSummary.count === 1
                                                ? "file"
                                                : "files"}{" "}
                                            · {appSummary.share}% of all your
                                            storage
                                        </span>
                                    </div>
                                    <div className="storage-breakdown-list">
                                        {[
                                            ["Images", appSummary.imageStorage],
                                            ["Videos", appSummary.videoStorage],
                                            ["PDFs", appSummary.pdfStorage],
                                            ["Other", appSummary.otherStorage],
                                        ].map(([label, size]) => (
                                            <div
                                                className="storage-breakdown-row"
                                                key={label}
                                            >
                                                <span>{label}</span>
                                                <strong>
                                                    {formatAppStorage(
                                                        Number(size),
                                                    )}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>
                                </SettingsCard>
                                <SettingsCard
                                    icon={<AlertTriangle aria-hidden="true" />}
                                    title="Danger zone"
                                    description={
                                        <>
                                            Deleting this app removes its{" "}
                                            {appSummary.count}{" "}
                                            {appSummary.count === 1
                                                ? "file"
                                                : "files"}{" "}
                                            and revokes its API keys.
                                        </>
                                    }
                                    tone="danger"
                                >
                                    <div className="settings-danger-action">
                                        <p>This action cannot be undone.</p>
                                        <DeleteAppButton
                                            appName={app.name || "this app"}
                                            appId={app.appId}
                                        />
                                    </div>
                                </SettingsCard>
                            </>
                        ),
                    },
                    {
                        value: "api-keys",
                        label: "API keys",
                        icon: <KeyRound aria-hidden="true" />,
                        content: (
                            <>
                                <SettingsCard
                                    icon={<KeyRound aria-hidden="true" />}
                                    title="API keys"
                                    description="Use a key with the MediaLit SDK or REST API. Keep keys out of client-side code; browsers upload with signatures instead."
                                >
                                    <ApiKeysSection
                                        appId={app.appId}
                                        keys={apiKeys.items}
                                        limit={apiKeys.limit}
                                    />
                                </SettingsCard>
                            </>
                        ),
                    },
                    {
                        value: "media",
                        label: "Media",
                        icon: <Film aria-hidden="true" />,
                        content: mediaSettings ? (
                            <>
                                <ImageOptimizationCard
                                    appId={app.appId}
                                    settings={mediaSettings}
                                />
                                <VideoStreamingCard
                                    appId={app.appId}
                                    settings={mediaSettings}
                                    minutes={minutes}
                                    selfHosted={
                                        subscriber?.deploymentMode === "oss"
                                    }
                                />
                            </>
                        ) : (
                            <div className="inline-error" role="alert">
                                Could not load this app’s media settings.
                            </div>
                        ),
                    },
                    {
                        value: "webhooks",
                        label: "Webhooks",
                        icon: <Webhook aria-hidden="true" />,
                        content: (
                            <>
                                <SettingsCard
                                    icon={<Webhook aria-hidden="true" />}
                                    title="Webhooks"
                                    description="Tell your server when processing of a sealed file finishes or fails. Each request is signed with the endpoint’s secret, following Standard Webhooks. Verify the signature before trusting a request."
                                >
                                    {webhooks ? (
                                        <WebhooksSection
                                            appId={app.appId}
                                            endpoints={webhooks.endpoints}
                                            events={webhooks.events}
                                        />
                                    ) : (
                                        <div
                                            className="inline-error"
                                            role="alert"
                                        >
                                            Could not load this app’s webhooks.
                                        </div>
                                    )}
                                </SettingsCard>
                                {webhooks ? (
                                    <SettingsCard
                                        icon={<History aria-hidden="true" />}
                                        title="Recent webhook deliveries"
                                        description="Failed deliveries are retried for about a day. Test events aren’t listed."
                                    >
                                        <DeliveriesTable
                                            deliveries={webhooks.deliveries}
                                            endpoints={webhooks.endpoints}
                                        />
                                    </SettingsCard>
                                ) : null}
                            </>
                        ),
                    },
                ]}
            />
        </>
    );
}
