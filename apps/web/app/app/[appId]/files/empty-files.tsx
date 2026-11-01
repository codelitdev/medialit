"use client";

import { useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import {
    uploadFilesToApp,
    uploadLabel,
    type UploadStatus,
} from "./upload-files";

type ToolTab = "mcp" | "cli" | "sdk";

const toolTabs: { key: ToolTab; label: string }[] = [
    { key: "mcp", label: "AI assistant (MCP)" },
    { key: "cli", label: "CLI" },
    { key: "sdk", label: "SDK and API" },
];

const panelClass = (active: boolean) =>
    `[grid-area:1/1] ${active ? "" : "invisible"}`;

const stepClass = "grid list-none grid-cols-[26px_minmax(0,1fr)] gap-3";
const stepNumberClass =
    "grid h-[26px] w-[26px] place-items-center rounded-full bg-muted text-[13px] font-semibold text-muted-foreground";

export default function EmptyFiles({
    appId,
    appName,
    serverUrl,
    apiEndpoint,
    includeCliEndpoint,
}: {
    appId: string;
    appName: string;
    serverUrl: string;
    apiEndpoint: string;
    includeCliEndpoint: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const [dragging, setDragging] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<UploadStatus | null>(null);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<ToolTab>("mcp");
    const [copied, setCopied] = useState<string | null>(null);

    async function upload(files: File[]) {
        if (!files.length) return;

        setBusy(true);
        setError("");
        setStatus(null);
        const result = await uploadFilesToApp(appId, files, setStatus);
        setStatus(null);
        if (result.error) setError(result.error);
        setBusy(false);
        if (result.uploaded) {
            toast.success(
                result.uploaded === 1
                    ? "File uploaded"
                    : `${result.uploaded} files uploaded`,
            );
            router.refresh();
        }
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setDragging(false);
        if (busy) return;
        upload(Array.from(event.dataTransfer.files));
    }

    async function copyText(text: string, key: string) {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            window.setTimeout(() => setCopied(null), 1800);
        } catch {
            setError("Could not copy. Select the text and copy it instead.");
        }
    }

    const cliCommands = [
        { key: "cli-install", command: "npm install -g @medialit/cli" },
        {
            key: "cli-login",
            command: `medialit login${includeCliEndpoint ? ` --endpoint "${apiEndpoint}"` : ""}`,
        },
        {
            key: "cli-upload",
            command: "medialit upload ./assets/hero.png --public",
        },
    ];

    const assistantPrompt = `Upload ./assets/hero.png to ${appName} and give me its URL.`;

    function copyBox(text: string, copyKey: string) {
        return (
            <div className="flex min-w-0 items-center justify-between gap-2 rounded-[10px] bg-muted py-2 pl-3 pr-2">
                <code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[13px] leading-5">
                    {text}
                </code>
                <button
                    type="button"
                    className="workspace-button secondary shrink-0"
                    onClick={() => copyText(text, copyKey)}
                    aria-label={`Copy ${text}`}
                >
                    {copied === copyKey ? (
                        <Check aria-hidden="true" />
                    ) : (
                        <Copy aria-hidden="true" />
                    )}
                    {copied === copyKey ? "Copied" : "Copy"}
                </button>
            </div>
        );
    }

    return (
        <div className="grid items-stretch gap-5 min-[860px]:grid-cols-2">
            <div
                className={`flex min-h-[420px] flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed p-9 text-center transition-colors ${
                    dragging
                        ? "border-primary bg-[color-mix(in_oklch,var(--primary),transparent_92%)]"
                        : "border-border bg-[color-mix(in_oklch,var(--card),transparent_35%)]"
                }`}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    aria-label="Choose files to upload"
                    onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = "";
                        upload(files);
                    }}
                />
                <div className="mb-3.5 grid h-[70px] w-[70px] place-items-center rounded-2xl bg-[color-mix(in_oklch,var(--primary),transparent_88%)] text-muted-foreground [&_svg]:h-[26px] [&_svg]:w-[26px]">
                    {busy ? (
                        <LoaderCircle
                            className="animate-spin"
                            aria-hidden="true"
                        />
                    ) : (
                        <Upload aria-hidden="true" />
                    )}
                </div>
                <h2
                    className="m-0 text-[17px] font-semibold"
                    aria-live="polite"
                >
                    {busy
                        ? uploadLabel(status)
                        : `Drop files to upload to ${appName}`}
                </h2>
                <p className="m-0 text-muted-foreground">
                    or{" "}
                    <button
                        type="button"
                        className="cursor-pointer bg-transparent p-0 font-[inherit] text-primary underline disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => inputRef.current?.click()}
                    >
                        browse your computer
                    </button>
                </p>
                <span className="text-[13px] text-muted-foreground">
                    Images, videos, PDFs and other files
                </span>
                {error ? (
                    <span className="inline-error" role="alert">
                        {error}
                    </span>
                ) : null}
            </div>

            <section
                className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-[22px]"
                aria-label="Upload from your tools"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="m-0 text-base font-semibold">
                        Or upload from your tools
                    </h2>
                    <Link
                        href={`/app/${encodeURIComponent(appId)}/connect`}
                        className="text-sm text-primary no-underline"
                    >
                        All options in Connect →
                    </Link>
                </div>

                <div
                    className="inline-flex flex-wrap gap-1 self-start rounded-[10px] bg-muted p-1"
                    role="tablist"
                >
                    {toolTabs.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tab === key}
                            onClick={() => setTab(key)}
                            className={`min-h-8 cursor-pointer rounded-[7px] px-3 font-[inherit] text-sm ${
                                tab === key
                                    ? "bg-background text-foreground shadow-sm"
                                    : "bg-transparent text-muted-foreground"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="grid">
                    <div
                        className={panelClass(tab === "mcp")}
                        aria-hidden={tab !== "mcp"}
                    >
                        <ol className="m-0 grid gap-3.5 p-0">
                            <li className={stepClass}>
                                <span className={stepNumberClass}>1</span>
                                <div>
                                    <p className="mb-2 leading-normal">
                                        Add a remote MCP server in your AI
                                        client and paste this URL.
                                    </p>
                                    {copyBox(serverUrl, "mcp-url")}
                                </div>
                            </li>
                            <li className={stepClass}>
                                <span className={stepNumberClass}>2</span>
                                <div>
                                    <p className="mb-2 leading-normal">
                                        Sign in to MediaLit and choose{" "}
                                        <strong>{appName}</strong> when asked.
                                    </p>
                                </div>
                            </li>
                            <li className={stepClass}>
                                <span className={stepNumberClass}>3</span>
                                <div>
                                    <p className="mb-2 leading-normal">
                                        Ask your assistant to upload something:
                                    </p>
                                    {copyBox(assistantPrompt, "mcp-prompt")}
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div
                        className={panelClass(tab === "cli")}
                        aria-hidden={tab !== "cli"}
                    >
                        <ol className="m-0 grid gap-3.5 p-0">
                            <li className={stepClass}>
                                <span className={stepNumberClass}>1</span>
                                <div>
                                    <p className="mb-2 leading-normal">
                                        Install the MediaLit CLI.
                                    </p>
                                    {copyBox(
                                        cliCommands[0].command,
                                        cliCommands[0].key,
                                    )}
                                </div>
                            </li>
                            <li className={stepClass}>
                                <span className={stepNumberClass}>2</span>
                                <div>
                                    <p className="mb-2 leading-normal">
                                        Log in in your browser and choose{" "}
                                        <strong>{appName}</strong>.
                                    </p>
                                    {copyBox(
                                        cliCommands[1].command,
                                        cliCommands[1].key,
                                    )}
                                </div>
                            </li>
                            <li className={stepClass}>
                                <span className={stepNumberClass}>3</span>
                                <div>
                                    <p className="mb-2 leading-normal">
                                        Upload a file from your terminal.
                                    </p>
                                    {copyBox(
                                        cliCommands[2].command,
                                        cliCommands[2].key,
                                    )}
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div
                        className={panelClass(tab === "sdk")}
                        aria-hidden={tab !== "sdk"}
                    >
                        <div>
                            <p className="mb-3 leading-normal text-muted-foreground">
                                Use {appName}’s API key to upload and serve
                                files from your own product.
                            </p>
                            <a
                                className="workspace-button secondary"
                                href="https://medialit.cloud/docs/quick-start"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Read the docs
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
