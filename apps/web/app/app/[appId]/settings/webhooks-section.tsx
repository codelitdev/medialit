"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import type {
    WebhookEndpoint,
    WebhookEvent,
    WebhookTestResult,
} from "@medialit/models";
import {
    createWebhook,
    deleteWebhook,
    revealWebhookSecret,
    testWebhook,
    updateWebhook,
} from "@/app/actions";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
    SettingsField,
    SettingsFieldset,
    SettingsHint,
    SettingsStatus,
} from "@/components/settings-field";

const EVENT_LABELS: Record<WebhookEvent, string> = {
    "media.processing.ready": "Processing finished",
    "media.processing.failed": "Processing failed",
    "media.captions.ready": "Captions finished or failed",
};

function describeTest(result: WebhookTestResult): string {
    if (result.result === "delivered") {
        return `Delivered (HTTP ${result.status})`;
    }
    if (result.status !== undefined) return `Failed (HTTP ${result.status})`;
    return `Failed (${(result.error ?? "error").replace(/_/g, " ")})`;
}

export default function WebhooksSection({
    appId,
    endpoints,
    events,
}: {
    appId: string;
    endpoints: WebhookEndpoint[];
    events: WebhookEvent[];
}) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
    const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);

    return (
        <div className="grid gap-4">
            {endpoints.length === 0 ? (
                <SettingsHint>
                    This app has no webhook endpoints yet.
                </SettingsHint>
            ) : (
                <ul className="grid gap-3" aria-label="Webhook endpoints">
                    {endpoints.map((endpoint) => (
                        <EndpointRow
                            key={endpoint.id}
                            appId={appId}
                            endpoint={endpoint}
                            onEdit={() => setEditing(endpoint)}
                            onDelete={() => setDeleting(endpoint)}
                            onChanged={() => router.refresh()}
                        />
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    className="workspace-button"
                    onClick={() => setCreateOpen(true)}
                >
                    Add endpoint
                </button>
            </div>

            <EndpointDialog
                appId={appId}
                events={events}
                endpoint={null}
                open={createOpen}
                onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) router.refresh();
                }}
            />
            <EndpointDialog
                appId={appId}
                events={events}
                endpoint={editing}
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditing(null);
                        router.refresh();
                    }
                }}
            />
            <DeleteDialog
                appId={appId}
                endpoint={deleting}
                onClose={(deleted) => {
                    setDeleting(null);
                    if (deleted) router.refresh();
                }}
            />
        </div>
    );
}

function EndpointRow({
    appId,
    endpoint,
    onEdit,
    onDelete,
    onChanged,
}: {
    appId: string;
    endpoint: WebhookEndpoint;
    onEdit: () => void;
    onDelete: () => void;
    onChanged: () => void;
}) {
    const [pending, setPending] = useState<"" | "test" | "rotate" | "toggle">(
        "",
    );
    const [feedback, setFeedback] = useState("");
    const [error, setError] = useState("");
    // A rotation returns the new secret once; show it right away.
    const [rotatedSecret, setRotatedSecret] = useState<string | undefined>();

    async function runTest() {
        setPending("test");
        setError("");
        setFeedback("");
        const response = await testWebhook(appId, endpoint.id);
        setPending("");
        if (!response.success) {
            setError(response.error);
            return;
        }
        setFeedback(`Test event: ${describeTest(response.result)}`);
    }

    async function change(
        kind: "rotate" | "toggle",
        input: Parameters<typeof updateWebhook>[2],
        done: string,
    ) {
        setPending(kind);
        setError("");
        setFeedback("");
        const response = await updateWebhook(appId, endpoint.id, input);
        setPending("");
        if (!response.success) {
            setError(response.error);
            return;
        }
        if (response.endpoint.secret)
            setRotatedSecret(response.endpoint.secret);
        setFeedback(done);
        onChanged();
    }

    return (
        <li className="grid gap-4 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                    <span className="break-all text-[13px] font-semibold leading-5 text-foreground">
                        {endpoint.url}
                    </span>
                    <SettingsHint>
                        {endpoint.enabled ? "Enabled" : "Disabled"} ·{" "}
                        {endpoint.events
                            .map((event) => EVENT_LABELS[event] ?? event)
                            .join(", ")}
                    </SettingsHint>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="workspace-button secondary"
                        disabled={pending !== ""}
                        onClick={runTest}
                    >
                        {pending === "test" ? "Sending…" : "Send test"}
                    </button>
                    <button
                        type="button"
                        className="workspace-button secondary"
                        disabled={pending !== ""}
                        onClick={() =>
                            change(
                                "toggle",
                                { enabled: !endpoint.enabled },
                                endpoint.enabled
                                    ? "Endpoint disabled."
                                    : "Endpoint enabled.",
                            )
                        }
                    >
                        {endpoint.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                        type="button"
                        className="workspace-button ghost"
                        disabled={pending !== ""}
                        onClick={onEdit}
                        aria-label={`Edit ${endpoint.url}`}
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        className="workspace-button ghost"
                        disabled={pending !== ""}
                        onClick={onDelete}
                        aria-label={`Delete ${endpoint.url}`}
                    >
                        Delete
                    </button>
                </div>
            </div>
            <SettingsField
                label="Signing secret"
                htmlFor={`secret-${endpoint.id}`}
            >
                <SecretField
                    // A rotation changes the hint and starts the field afresh.
                    key={endpoint.secretHint}
                    appId={appId}
                    endpointId={endpoint.id}
                    hint={endpoint.secretHint}
                    secret={rotatedSecret}
                    initiallyShown={rotatedSecret !== undefined}
                >
                    <button
                        type="button"
                        className="workspace-button secondary"
                        disabled={pending !== ""}
                        onClick={() =>
                            change(
                                "rotate",
                                { rotateSecret: true },
                                "New secret created. Update your receiver to use it.",
                            )
                        }
                    >
                        {pending === "rotate" ? "Rotating…" : "Rotate secret"}
                    </button>
                </SecretField>
            </SettingsField>
            <SettingsStatus error={error} success={feedback} />
        </li>
    );
}

/**
 * The signing secret, hidden until asked for, with a copy button. The
 * endpoint list carries only the secret's last characters, so showing or
 * copying it fetches it with the reveal action, unless it was just
 * returned (create, rotate).
 */
function SecretField({
    appId,
    endpointId,
    hint,
    secret: known,
    initiallyShown = false,
    children,
}: {
    appId: string;
    endpointId: string;
    hint: string;
    secret?: string;
    initiallyShown?: boolean;
    /** More buttons for the row, after Show and Copy. */
    children?: ReactNode;
}) {
    const [secret, setSecret] = useState<string | undefined>(known);
    const [shown, setShown] = useState(initiallyShown && Boolean(known));
    const [copied, setCopied] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    async function load(): Promise<string | undefined> {
        if (secret) return secret;
        setPending(true);
        setError("");
        const response = await revealWebhookSecret(appId, endpointId);
        setPending(false);
        if (!response.success) {
            setError(response.error);
            return undefined;
        }
        setSecret(response.secret);
        return response.secret;
    }

    async function toggle() {
        if (shown) {
            setShown(false);
            return;
        }
        if (await load()) setShown(true);
    }

    async function copy() {
        const value = await load();
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setShown(true);
        }
    }

    return (
        <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <input
                    id={`secret-${endpointId}`}
                    className="settings-input settings-mono-input grow basis-[220px]"
                    value={
                        shown && secret ? secret : `whsec_••••••••••••${hint}`
                    }
                    readOnly
                    onFocus={(event) => shown && event.currentTarget.select()}
                />
                <button
                    type="button"
                    className="workspace-button secondary"
                    disabled={pending}
                    onClick={toggle}
                    aria-label={shown ? "Hide secret" : "Show secret"}
                >
                    {shown ? (
                        <EyeOff aria-hidden="true" />
                    ) : (
                        <Eye aria-hidden="true" />
                    )}
                    {shown ? "Hide" : "Show"}
                </button>
                <button
                    type="button"
                    className="workspace-button secondary"
                    disabled={pending}
                    onClick={copy}
                >
                    {copied ? (
                        <Check aria-hidden="true" />
                    ) : (
                        <Copy aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy"}
                </button>
                {children}
            </div>
            <SettingsStatus error={error} />
        </div>
    );
}

/** Adds an endpoint, or edits one when `endpoint` is set. */
function EndpointDialog({
    appId,
    events,
    endpoint,
    open,
    onOpenChange,
}: {
    appId: string;
    events: WebhookEvent[];
    endpoint: WebhookEndpoint | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const editing = endpoint !== null;
    const [url, setUrl] = useState("");
    const [selected, setSelected] = useState<WebhookEvent[]>(events);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [created, setCreated] = useState<WebhookEndpoint | null>(null);
    const [loadedFor, setLoadedFor] = useState<string | null>(null);

    // Fill the form from the endpoint being edited, once per opening.
    const key = open ? (endpoint?.id ?? "new") : null;
    if (key !== loadedFor) {
        setLoadedFor(key);
        setUrl(endpoint?.url ?? "");
        setSelected(endpoint?.events ?? events);
        setError("");
        setCreated(null);
    }

    function toggle(event: WebhookEvent) {
        setSelected((current) =>
            current.includes(event)
                ? current.filter((item) => item !== event)
                : [...current, event],
        );
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        setPending(true);
        setError("");
        const input = { url: url.trim(), events: selected };
        const response = editing
            ? await updateWebhook(appId, endpoint.id, input)
            : await createWebhook(appId, input);
        setPending(false);
        if (!response.success) {
            setError(response.error);
            return;
        }
        if (editing) onOpenChange(false);
        else setCreated(response.endpoint);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>
                        {created
                            ? "Endpoint added"
                            : editing
                              ? "Edit endpoint"
                              : "Add endpoint"}
                    </DialogTitle>
                    <DialogDescription>
                        {created
                            ? "Use this secret to verify the webhook-signature header. You can show it again on this page."
                            : "MediaLit sends a signed POST request to this URL. It must be reachable from the internet over https."}
                    </DialogDescription>
                </DialogHeader>
                {created ? (
                    <>
                        <SecretField
                            appId={appId}
                            endpointId={created.id}
                            hint={created.secretHint}
                            secret={created.secret}
                            initiallyShown
                        />
                        <DialogFooter>
                            <button
                                type="button"
                                className="workspace-button"
                                onClick={() => onOpenChange(false)}
                            >
                                Done
                            </button>
                        </DialogFooter>
                    </>
                ) : (
                    <form onSubmit={submit} className="grid gap-4">
                        <SettingsField label="URL" htmlFor="webhook-url">
                            <input
                                id="webhook-url"
                                className="settings-input"
                                type="url"
                                value={url}
                                required
                                maxLength={2048}
                                placeholder="https://example.com/hooks/medialit"
                                onChange={(event) => setUrl(event.target.value)}
                            />
                        </SettingsField>
                        <SettingsFieldset legend="Events">
                            {events.map((item) => (
                                <div
                                    key={item}
                                    className="flex items-center gap-2"
                                >
                                    <Checkbox
                                        id={`event-${item}`}
                                        checked={selected.includes(item)}
                                        onCheckedChange={() => toggle(item)}
                                    />
                                    <label
                                        htmlFor={`event-${item}`}
                                        className="text-sm font-normal"
                                    >
                                        {EVENT_LABELS[item] ?? item}{" "}
                                        <code className="settings-subtle">
                                            {item}
                                        </code>
                                    </label>
                                </div>
                            ))}
                        </SettingsFieldset>
                        {error ? (
                            <p className="inline-error" role="alert">
                                {error}
                            </p>
                        ) : null}
                        <DialogFooter>
                            <button
                                type="button"
                                className="workspace-button secondary"
                                disabled={pending}
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="workspace-button"
                                disabled={
                                    pending ||
                                    !url.trim() ||
                                    selected.length === 0
                                }
                            >
                                {pending
                                    ? "Saving…"
                                    : editing
                                      ? "Save"
                                      : "Add endpoint"}
                            </button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

function DeleteDialog({
    appId,
    endpoint,
    onClose,
}: {
    appId: string;
    endpoint: WebhookEndpoint | null;
    onClose: (deleted: boolean) => void;
}) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    async function remove() {
        if (!endpoint) return;
        setPending(true);
        setError("");
        const result = await deleteWebhook(appId, endpoint.id);
        setPending(false);
        if (!result.success) {
            setError(result.error || "Could not delete the endpoint.");
            return;
        }
        onClose(true);
    }

    return (
        <Dialog
            open={endpoint !== null}
            onOpenChange={(open) => {
                if (!open) {
                    setError("");
                    onClose(false);
                }
            }}
        >
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>Delete this endpoint?</DialogTitle>
                    <DialogDescription>
                        {endpoint?.url} stops getting events, including
                        deliveries that are waiting to be retried. This can’t be
                        undone.
                    </DialogDescription>
                </DialogHeader>
                {error ? (
                    <p className="inline-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <DialogFooter>
                    <button
                        type="button"
                        className="workspace-button secondary"
                        disabled={pending}
                        onClick={() => onClose(false)}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="workspace-button danger"
                        disabled={pending}
                        onClick={remove}
                    >
                        {pending ? "Deleting…" : "Delete endpoint"}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
