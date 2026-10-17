"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey } from "@medialit/models";
import { createApiKey, revokeApiKey } from "@/app/actions";
import ApiKeyReveal from "@/components/api-key-reveal";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

function formatDate(value: string | null): string {
    if (!value) return "Never";
    return new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default function ApiKeysSection({
    appId,
    keys,
    limit,
}: {
    appId: string;
    keys: ApiKey[];
    limit: number;
}) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);
    const [revoking, setRevoking] = useState<ApiKey | null>(null);
    const atLimit = keys.length >= limit;

    return (
        <>
            {keys.length === 0 ? (
                <p className="settings-subtle">
                    This app has no API keys yet. Create one to use the SDK or
                    REST API.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="settings-subtle">
                                <th className="py-2 pr-4 font-medium">Name</th>
                                <th className="py-2 pr-4 font-medium">Key</th>
                                <th className="py-2 pr-4 font-medium">
                                    Created
                                </th>
                                <th className="py-2 pr-4 font-medium">
                                    Last used
                                </th>
                                <th className="py-2">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map((key) => (
                                <tr key={key.keyId} className="border-t">
                                    <td className="py-2 pr-4">{key.name}</td>
                                    <td className="py-2 pr-4 font-mono">
                                        {key.keyPrefix}…
                                    </td>
                                    <td className="py-2 pr-4">
                                        {formatDate(key.createdAt)}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {formatDate(key.lastUsedAt)}
                                    </td>
                                    <td className="py-2 text-right">
                                        {key.managedByConfiguration ? (
                                            <span
                                                className="settings-subtle"
                                                title="Set by MEDIALIT_BOOTSTRAP_API_KEY. Change or remove that setting to rotate it."
                                            >
                                                Managed by configuration
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="workspace-button ghost"
                                                aria-label={`Revoke ${key.name}`}
                                                onClick={() => setRevoking(key)}
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    className="workspace-button"
                    disabled={atLimit}
                    onClick={() => setCreateOpen(true)}
                >
                    Create key
                </button>
                {atLimit ? (
                    <span className="settings-subtle">
                        Apps can have {limit} keys. Revoke one you no longer use
                        to create another.
                    </span>
                ) : null}
            </div>

            <CreateKeyDialog
                appId={appId}
                open={createOpen}
                onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) router.refresh();
                }}
            />
            <RevokeKeyDialog
                appId={appId}
                apiKey={revoking}
                onClose={(revoked) => {
                    setRevoking(null);
                    if (revoked) router.refresh();
                }}
            />
        </>
    );
}

function CreateKeyDialog({
    appId,
    open,
    onOpenChange,
}: {
    appId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [name, setName] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [secret, setSecret] = useState<string | null>(null);

    function handleOpenChange(next: boolean) {
        if (!next) {
            // The secret must not linger once the dialog closes.
            setName("");
            setError("");
            setSecret(null);
        }
        onOpenChange(next);
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        setPending(true);
        setError("");
        const result = await createApiKey(appId, name.trim());
        setPending(false);
        if (!result.success) {
            setError(result.error);
            return;
        }
        setSecret(result.key);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>
                        {secret ? "Store your new key" : "Create API key"}
                    </DialogTitle>
                    <DialogDescription>
                        {secret
                            ? "Use it in the x-medialit-apikey header. Keep it out of client-side code."
                            : "Name the key after where you’ll use it, so you know which one to revoke later."}
                    </DialogDescription>
                </DialogHeader>
                {secret ? (
                    <>
                        <ApiKeyReveal secret={secret} />
                        <DialogFooter>
                            <button
                                type="button"
                                className="workspace-button"
                                onClick={() => handleOpenChange(false)}
                            >
                                Done
                            </button>
                        </DialogFooter>
                    </>
                ) : (
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="settings-field">
                            <label htmlFor="api-key-name">Name</label>
                            <input
                                id="api-key-name"
                                className="settings-input"
                                value={name}
                                maxLength={100}
                                required
                                placeholder="Production server"
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                        </div>
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
                                onClick={() => handleOpenChange(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="workspace-button"
                                disabled={pending || !name.trim()}
                            >
                                {pending ? "Creating…" : "Create key"}
                            </button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

function RevokeKeyDialog({
    appId,
    apiKey,
    onClose,
}: {
    appId: string;
    apiKey: ApiKey | null;
    onClose: (revoked: boolean) => void;
}) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    async function revoke() {
        if (!apiKey) return;
        setPending(true);
        setError("");
        const result = await revokeApiKey(appId, apiKey.keyId);
        setPending(false);
        if (!result.success) {
            setError(result.error || "Could not revoke the key.");
            return;
        }
        onClose(true);
    }

    return (
        <Dialog
            open={apiKey !== null}
            onOpenChange={(open) => {
                if (!open) {
                    setError("");
                    onClose(false);
                }
            }}
        >
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>Revoke {apiKey?.name}?</DialogTitle>
                    <DialogDescription>
                        Anything using {apiKey?.keyPrefix}… stops working right
                        away, along with upload signatures it created. This
                        can’t be undone.
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
                        onClick={revoke}
                    >
                        {pending ? "Revoking…" : "Revoke key"}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
