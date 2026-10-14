"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react";

export default function ConnectGuide({
    appName,
    apiEndpoint,
    includeCliEndpoint,
    serverUrl,
}: {
    appName: string;
    apiEndpoint: string;
    includeCliEndpoint: boolean;
    serverUrl: string;
}) {
    const [copied, setCopied] = useState<string | null>(null);
    const [copyError, setCopyError] = useState<string | null>(null);

    async function copyText(text: string, key: string) {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setCopyError(null);
            window.setTimeout(() => setCopied(null), 1800);
        } catch {
            setCopyError(key);
        }
    }

    const cliCommands = [
        {
            name: "Install the CLI",
            key: "cli-install",
            command: "npm install -g @medialit/cli",
        },
        {
            name: "Log in and choose this app",
            key: "cli-login",
            command: `medialit login${includeCliEndpoint ? ` --endpoint "${apiEndpoint}"` : ""}`,
        },
        {
            name: "Upload a file",
            key: "cli-upload",
            command: "medialit upload ./photo.jpg --public",
        },
    ];

    function mcpUrlRow(id: string, copyKey: string) {
        return (
            <>
                <label className="connect-url-label" htmlFor={id}>
                    MCP server URL
                </label>
                <div className="connect-url-row">
                    <input id={id} value={serverUrl} readOnly />
                    <button
                        type="button"
                        className="workspace-button secondary"
                        onClick={() => copyText(serverUrl, copyKey)}
                    >
                        {copied === copyKey ? (
                            <Check aria-hidden="true" />
                        ) : (
                            <Copy aria-hidden="true" />
                        )}
                        {copied === copyKey ? "Copied" : "Copy URL"}
                    </button>
                </div>
                {copyError === copyKey ? (
                    <p className="inline-error" role="alert">
                        Could not copy the server URL. Select and copy it
                        instead.
                    </p>
                ) : null}
            </>
        );
    }

    return (
        <div className="connect-panel">
            <details className="connect-method-card" open>
                <summary>
                    <h2>MCP</h2>
                    <ChevronDown aria-hidden="true" />
                </summary>
                <div className="connect-method-content">
                    <p>
                        Add MediaLit as an MCP server so your AI assistant can
                        find files, upload new ones, copy their URLs, and change
                        who can see them in {appName}. No API key needed.
                    </p>
                    {mcpUrlRow("mcp-server-url", "mcp-url")}
                    <ol className="connect-steps">
                        <li>
                            Open your AI client’s MCP settings and add a remote
                            server.
                        </li>
                        <li>
                            Choose an HTTP or Streamable HTTP connection, then
                            paste the MCP server URL above.
                        </li>
                        <li>
                            Connect and sign in to MediaLit, then select{" "}
                            {appName} when prompted.
                        </li>
                    </ol>
                    <div className="connect-asks">
                        <h3>Things to ask once it’s connected</h3>
                        <ul className="connect-examples">
                            <li>
                                “Upload ./assets/hero.png to {appName} and give
                                me its URL.”
                            </li>
                            <li>
                                “Which videos in {appName} are larger than 2
                                MB?”
                            </li>
                            <li>“Make every PDF in {appName} private.”</li>
                        </ul>
                    </div>
                </div>
            </details>

            <details className="connect-method-card">
                <summary>
                    <h2>CLI</h2>
                    <ChevronDown aria-hidden="true" />
                </summary>
                <div className="connect-method-content">
                    <p>
                        Install MediaLit’s CLI, sign in in your browser and
                        select this app, then upload files from your terminal.
                    </p>
                    <div className="connect-cli-commands">
                        {cliCommands.map(({ name, key, command }) => (
                            <div className="connect-cli-command" key={key}>
                                <div className="connect-cli-command-heading">
                                    <strong>{name}</strong>
                                    <button
                                        type="button"
                                        className="workspace-button secondary"
                                        onClick={() => copyText(command, key)}
                                        aria-label={`Copy ${name} command`}
                                    >
                                        {copied === key ? (
                                            <Check aria-hidden="true" />
                                        ) : (
                                            <Copy aria-hidden="true" />
                                        )}
                                        {copied === key ? "Copied" : "Copy"}
                                    </button>
                                </div>
                                <code>{command}</code>
                            </div>
                        ))}
                    </div>
                    {copyError?.startsWith("cli-") ? (
                        <p className="inline-error" role="alert">
                            Could not copy the command. Select and copy it
                            instead.
                        </p>
                    ) : null}
                </div>
            </details>

            <section className="connect-docs-card">
                <div>
                    <strong>SDK and REST API</strong>
                    <p>
                        Use this app’s API key to upload and serve files from
                        your own product.
                    </p>
                </div>
                <a
                    className="workspace-button secondary"
                    href="https://docs.medialit.cloud/quick-start"
                    target="_blank"
                    rel="noreferrer"
                >
                    Read the docs <ExternalLink aria-hidden="true" />
                </a>
            </section>
        </div>
    );
}
