import type { WebhookDelivery, WebhookEndpoint } from "@medialit/models";

/* A fixed locale and time zone, so the server and the browser render the
   same text. */
const timeFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
});

const STATUS_LABELS: Record<WebhookDelivery["status"], string> = {
    queued: "Waiting to retry",
    running: "Sending",
    succeeded: "Delivered",
    failed: "Failed",
    cancelled: "Cancelled",
};

function lastResult(delivery: WebhookDelivery): string {
    if (delivery.responseStatus !== undefined) {
        return `HTTP ${delivery.responseStatus}`;
    }
    if (delivery.error) return delivery.error.replace(/_/g, " ");
    return "—";
}

export default function DeliveriesTable({
    deliveries,
    endpoints,
}: {
    deliveries: WebhookDelivery[];
    endpoints: WebhookEndpoint[];
}) {
    if (deliveries.length === 0) {
        return (
            <p className="settings-subtle">
                No deliveries yet. Events are sent when processing of a sealed
                file finishes.
            </p>
        );
    }
    const urls = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="settings-subtle">
                        <th className="py-2 pr-4 font-medium">Queued</th>
                        <th className="py-2 pr-4 font-medium">Event</th>
                        <th className="py-2 pr-4 font-medium">Endpoint</th>
                        <th className="py-2 pr-4 font-medium">Media</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 font-medium">Attempts</th>
                        <th className="py-2 font-medium">Last result</th>
                    </tr>
                </thead>
                <tbody>
                    {deliveries.map((delivery) => (
                        <tr key={delivery.id} className="border-t">
                            <td className="py-2 pr-4 whitespace-nowrap">
                                {timeFormat.format(
                                    new Date(delivery.createdAt),
                                )}
                            </td>
                            <td className="py-2 pr-4 font-mono">
                                {delivery.event}
                            </td>
                            <td className="py-2 pr-4 break-all">
                                {urls.get(delivery.endpointId)?.url ??
                                    "Deleted endpoint"}
                            </td>
                            <td className="py-2 pr-4 font-mono">
                                {delivery.mediaId ?? "—"}
                            </td>
                            <td className="py-2 pr-4">
                                {STATUS_LABELS[delivery.status] ??
                                    delivery.status}
                                {delivery.nextAttemptAt ? (
                                    <span className="settings-subtle block">
                                        Next:{" "}
                                        {timeFormat.format(
                                            new Date(delivery.nextAttemptAt),
                                        )}
                                    </span>
                                ) : null}
                            </td>
                            <td className="py-2 pr-4">
                                {delivery.attempts} of {delivery.maxAttempts}
                            </td>
                            <td className="py-2">{lastResult(delivery)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
