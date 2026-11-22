import { redirect } from "next/navigation";
import { History, Webhook } from "lucide-react";
import { auth } from "@/auth";
import { getApp, listWebhooks } from "@/app/actions";
import WebhooksSection from "./webhooks-section";
import DeliveriesTable from "./deliveries-table";

export default async function Webhooks(props: {
    params: Promise<{ appId: string }>;
}) {
    const [{ appId }, session] = await Promise.all([props.params, auth()]);
    if (!session) redirect("/login");

    const [app, data] = await Promise.all([
        getApp(appId),
        listWebhooks(appId).catch(() => null),
    ]);
    if (!app) redirect("/");

    if (!data) {
        return (
            <div className="inline-error" role="alert">
                Could not load this app’s webhooks.
            </div>
        );
    }

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <h1>Webhooks</h1>
                    <p>
                        Tell your server when processing of a sealed file in{" "}
                        {app.name || "this app"} finishes or fails.
                    </p>
                </div>
            </div>

            <div className="settings-stack">
                <section className="settings-card">
                    <div className="settings-card-title">
                        <span className="settings-card-icon">
                            <Webhook aria-hidden="true" />
                        </span>
                        <div>
                            <h2>Endpoints</h2>
                            <p className="settings-subtle">
                                Each request is signed with the endpoint’s
                                secret, following Standard Webhooks. Verify the
                                signature before trusting a request.
                            </p>
                        </div>
                    </div>
                    <WebhooksSection
                        appId={app.appId}
                        endpoints={data.endpoints}
                        events={data.events}
                    />
                </section>

                <section className="settings-card">
                    <div className="settings-card-title">
                        <span className="settings-card-icon">
                            <History aria-hidden="true" />
                        </span>
                        <div>
                            <h2>Recent deliveries</h2>
                            <p className="settings-subtle">
                                Failed deliveries are retried for about a day.
                                Test events aren’t listed.
                            </p>
                        </div>
                    </div>
                    <DeliveriesTable
                        deliveries={data.deliveries}
                        endpoints={data.endpoints}
                    />
                </section>
            </div>
        </>
    );
}
