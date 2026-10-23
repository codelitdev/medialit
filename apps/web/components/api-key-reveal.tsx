"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Shows a newly created API key once, with a copy button. The key can't be
 * displayed again after this. */
export default function ApiKeyReveal({ secret }: { secret: string }) {
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    async function copyKey() {
        try {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setError("");
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setError("Could not copy the key. Select and copy it instead.");
        }
    }

    return (
        <div className="grid gap-3">
            <p className="text-sm" role="status">
                Store this key now. It won’t be shown again.
            </p>
            <div className="settings-control-row">
                <input
                    className="settings-input settings-mono-input"
                    value={secret}
                    readOnly
                    aria-label="New API key"
                    onFocus={(event) => event.currentTarget.select()}
                />
                <button
                    type="button"
                    className="workspace-button secondary"
                    onClick={copyKey}
                >
                    {copied ? (
                        <Check aria-hidden="true" />
                    ) : (
                        <Copy aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            {error ? (
                <p className="inline-error" role="alert">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
