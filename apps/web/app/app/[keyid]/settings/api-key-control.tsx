"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

export default function ApiKeyControl({ apiKey }: { apiKey: string }) {
    const [visible, setVisible] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    async function copyKey() {
        try {
            await navigator.clipboard.writeText(apiKey);
            setCopied(true);
            setError("");
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setError("Could not copy the API key. Select and copy it instead.");
        }
    }

    return (
        <>
            <div className="settings-control-row">
                <input
                    className="settings-input settings-mono-input"
                    value={apiKey}
                    type={visible ? "text" : "password"}
                    readOnly
                    aria-label="API key"
                />
                <button
                    type="button"
                    className="icon-control settings-icon-control"
                    aria-label={visible ? "Hide API key" : "Show API key"}
                    onClick={() => setVisible((current) => !current)}
                >
                    {visible ? (
                        <EyeOff aria-hidden="true" />
                    ) : (
                        <Eye aria-hidden="true" />
                    )}
                </button>
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
        </>
    );
}
