/**
 * Run against a live API with a dedicated key and no concurrent media writes
 * or media-settings changes:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:mcp
 *
 * This exercises the MCP Streamable HTTP endpoint and deletes only media
 * created by this run.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generatePng } from "./utils";

type JsonObject = Record<string, unknown>;
type MediaSettings = JsonObject & {
    useWebP: boolean;
    webpOutputQuality: number;
    thumbnailWidth: number;
    thumbnailHeight: number;
};

interface Stats {
    storage: number;
    maxStorage: number;
}

const EXPECTED_MCP_TOOLS = [
    "create_upload_signature",
    "delete_media",
    "get_media",
    "get_media_count",
    "get_media_settings",
    "get_total_storage",
    "list_media",
    "seal_media",
    "update_media_settings",
    "upload_media",
    "whoami",
].sort();

function object(value: unknown, label = "value"): JsonObject {
    assert(
        value && typeof value === "object" && !Array.isArray(value),
        `Expected ${label} to be a JSON object`,
    );
    return value as JsonObject;
}

function nonemptyText(value: unknown, label: string): string {
    assert(
        typeof value === "string" && value.length > 0,
        `${label} must be a nonempty string`,
    );
    return value;
}

function integer(value: unknown, label: string): number {
    assert(
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
        `${label} must be a nonnegative integer`,
    );
    return value;
}

function mediaSettings(value: unknown): MediaSettings {
    const settings = object(value, "media settings");
    assert.equal(typeof settings.useWebP, "boolean");
    return {
        useWebP: settings.useWebP as boolean,
        webpOutputQuality: integer(
            settings.webpOutputQuality,
            "webpOutputQuality",
        ),
        thumbnailWidth: integer(settings.thumbnailWidth, "thumbnailWidth"),
        thumbnailHeight: integer(settings.thumbnailHeight, "thumbnailHeight"),
    };
}

class McpSession {
    private sessionId?: string;
    private protocolVersion?: string;
    private lastSessionId?: string;
    private nextId = 1;

    constructor(
        private readonly endpoint: URL,
        private readonly apiKey: string,
    ) {}

    private async send(
        message: JsonObject,
        expectedStatus: number,
    ): Promise<JsonObject | undefined> {
        const headers = new Headers({
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            "x-medialit-apikey": this.apiKey,
        });
        if (this.sessionId) headers.set("mcp-session-id", this.sessionId);
        if (this.protocolVersion) {
            headers.set("mcp-protocol-version", this.protocolVersion);
        }

        const response = await fetch(this.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(message),
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
        });
        this.lastSessionId =
            response.headers.get("mcp-session-id") ?? this.lastSessionId;
        const body = await response.text();
        if (response.status !== expectedStatus) {
            throw new Error(
                `MCP ${String(message.method)}: expected HTTP ${expectedStatus}, got ${response.status}: ${body
                    .split(this.apiKey)
                    .join("[redacted]")
                    .slice(0, 1000)}`,
            );
        }
        if (expectedStatus === 202) return undefined;

        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            throw new Error(
                `MCP ${String(message.method)} returned invalid JSON`,
            );
        }
        return object(parsed, "JSON-RPC response");
    }

    async connect(): Promise<void> {
        const response = await this.send(
            {
                jsonrpc: "2.0",
                id: this.nextId++,
                method: "initialize",
                params: {
                    protocolVersion: "2025-11-25",
                    capabilities: {},
                    clientInfo: {
                        name: "medialit-integration-test",
                        version: "1.0.0",
                    },
                },
            },
            200,
        );
        assert(response);
        assert.equal(
            response.error,
            undefined,
            "MCP initialize returned an error",
        );
        const result = object(response.result, "initialize result");
        this.sessionId = nonemptyText(this.lastSessionId, "MCP session ID");
        this.protocolVersion = nonemptyText(
            result.protocolVersion,
            "MCP protocol version",
        );
        await this.notify("notifications/initialized");
    }

    private async notify(method: string): Promise<void> {
        await this.send({ jsonrpc: "2.0", method }, 202);
    }

    async request(
        method: string,
        params: JsonObject = {},
    ): Promise<JsonObject> {
        const id = this.nextId++;
        const response = await this.send(
            { jsonrpc: "2.0", id, method, params },
            200,
        );
        assert(response);
        assert.equal(
            response.id,
            id,
            `MCP ${method} returned an unexpected ID`,
        );
        if (response.error) {
            const error = object(response.error, "JSON-RPC error");
            throw new Error(`MCP ${method} failed: ${String(error.message)}`);
        }
        return object(response.result, `MCP ${method} result`);
    }

    async callToolResult(name: string, args?: JsonObject): Promise<JsonObject> {
        return this.request("tools/call", {
            name,
            ...(args ? { arguments: args } : {}),
        });
    }

    async callTool(name: string, args?: JsonObject): Promise<JsonObject> {
        const result = await this.callToolResult(name, args);
        if (result.isError === true) {
            const content = Array.isArray(result.content) ? result.content : [];
            const detail = content
                .map((item) => object(item).text)
                .filter((item): item is string => typeof item === "string")
                .join("; ");
            throw new Error(`MCP tool ${name} failed: ${detail}`);
        }
        return object(result.structuredContent, `${name} structuredContent`);
    }

    async close(): Promise<void> {
        if (!this.sessionId) return;
        const headers = new Headers({ "x-medialit-apikey": this.apiKey });
        headers.set("mcp-session-id", this.sessionId);
        if (this.protocolVersion) {
            headers.set("mcp-protocol-version", this.protocolVersion);
        }
        const response = await fetch(this.endpoint, {
            method: "DELETE",
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
        });
        if (response.status !== 200) {
            const body = (await response.text())
                .split(this.apiKey)
                .join("[redacted]");
            throw new Error(
                `MCP session close: expected HTTP 200, got ${response.status}: ${body.slice(0, 1000)}`,
            );
        }
        this.sessionId = undefined;
    }
}

export async function runMcpIntegrationTests(
    options: {
        apiKey?: string;
        server?: string;
        /** The storage limit the account's plan grants, when the caller knows it. */
        expectedMaxStorage?: number;
        log?: (message: string) => void;
    } = {},
): Promise<void> {
    const apiKey = options.apiKey ?? process.env.MEDIALIT_APIKEY;
    const expectedMaxStorage =
        options.expectedMaxStorage ??
        (process.env.MEDIALIT_EXPECTED_MAX_STORAGE
            ? Number(process.env.MEDIALIT_EXPECTED_MAX_STORAGE)
            : undefined);
    assert(
        expectedMaxStorage === undefined ||
            (Number.isSafeInteger(expectedMaxStorage) &&
                expectedMaxStorage > 0),
        "MEDIALIT_EXPECTED_MAX_STORAGE must be a positive integer",
    );
    assert(
        typeof apiKey === "string" && apiKey.trim(),
        "MEDIALIT_APIKEY is required",
    );
    const server =
        options.server ?? process.env.MEDIALIT_SERVER ?? "localhost:8000";
    const base = new URL(
        /^https?:\/\//i.test(server) ? server : `http://${server}`,
    );
    assert(
        ["http:", "https:"].includes(base.protocol),
        "MEDIALIT_SERVER must use HTTP or HTTPS",
    );
    assert(
        !base.username && !base.password && !base.search && !base.hash,
        "MEDIALIT_SERVER must be a base URL without credentials, query, or fragment",
    );
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    const endpoint = new URL("mcp", base);
    const log = options.log ?? console.log;
    const group = `__mcp_integration_${randomUUID()}`;
    const png = generatePng();
    const pending = new Set<string>();
    let baseline: Stats | undefined;
    let baselineCount: number | undefined;
    let uploadAttempted = false;
    let settingsToRestore: MediaSettings | undefined;
    let failure: unknown;
    const cleanupErrors: unknown[] = [];
    const client = new McpSession(endpoint, apiKey);

    async function storage(): Promise<Stats> {
        const result = await client.callTool("get_total_storage");
        return {
            storage: integer(result.storage, "storage"),
            maxStorage: integer(result.maxStorage, "maxStorage"),
        };
    }

    async function count(): Promise<number> {
        return integer(
            (await client.callTool("get_media_count")).count,
            "count",
        );
    }

    async function list(groupFilter: string): Promise<JsonObject[]> {
        const result = await client.callTool("list_media", {
            page: 1,
            limit: 100,
            group: groupFilter,
        });
        assert(Array.isArray(result.mediaItems), "mediaItems must be an array");
        return result.mediaItems.map((media) => object(media, "media item"));
    }

    async function getMediaSettings(): Promise<MediaSettings> {
        return mediaSettings(await client.callTool("get_media_settings"));
    }

    async function updateMediaSettings(settings: MediaSettings): Promise<void> {
        const result = await client.callTool("update_media_settings", settings);
        assert.equal(result.message, "success");
    }

    async function restoreMediaSettings(): Promise<void> {
        if (!settingsToRestore) return;
        const original = settingsToRestore;
        await updateMediaSettings(original);
        assert.deepEqual(await getMediaSettings(), original);
        settingsToRestore = undefined;
    }

    async function uploadWithSignature(
        signature: string,
        filename: string,
        caption: string,
    ): Promise<JsonObject> {
        const form = new FormData();
        form.set(
            "file",
            new Blob([Uint8Array.from(png)], { type: "image/png" }),
            filename,
        );
        form.set("access", "private");
        form.set("caption", caption);
        const response = await fetch(new URL("media/create", base), {
            method: "POST",
            headers: { "x-medialit-signature": signature },
            body: form,
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
        });
        const body = await response.text();
        if (response.status !== 200) {
            throw new Error(
                `Signed upload: expected HTTP 200, got ${response.status}: ${body
                    .split(signature)
                    .join("[redacted]")
                    .slice(0, 1000)}`,
            );
        }
        return object(JSON.parse(body), "signed upload response");
    }

    /** whoami reports the same app usage as the dedicated tools. */
    async function checkWhoami(expected: Stats & { files: number }) {
        const result = await client.callTool("whoami");
        assert.equal(result.auth, "apikey");
        nonemptyText(result.email, "whoami email");
        const app = object(result.app, "whoami app");
        nonemptyText(app.id, "whoami app id");
        nonemptyText(app.name, "whoami app name");
        assert.equal(typeof app.default, "boolean");
        assert.equal(
            JSON.stringify(result).includes(apiKey!),
            false,
            "whoami must not return the API key",
        );
        assert.equal(result.files, expected.files);
        assert.equal(result.storage, expected.storage);
        assert.equal(result.maxStorage, expected.maxStorage);
    }

    async function checkTotals(bytes: number, files: number): Promise<void> {
        assert(baseline && baselineCount !== undefined);
        const current = await storage();
        assert.equal(current.maxStorage, baseline.maxStorage);
        assert.equal(current.storage, baseline.storage + bytes);
        assert.equal(
            current.maxStorage - current.storage,
            baseline.maxStorage - baseline.storage - bytes,
        );
        assert.equal(await count(), baselineCount + files);
        await checkWhoami({ ...current, files: baselineCount + files });
    }

    log(`MediaLit MCP integration run ${group} against ${endpoint.origin}`);
    try {
        await client.connect();
        const listedTools = await client.request("tools/list");
        assert(
            Array.isArray(listedTools.tools),
            "tools/list must return tools",
        );
        const toolNames = new Set(
            listedTools.tools.map((tool) =>
                nonemptyText(object(tool).name, "tool name"),
            ),
        );
        assert.deepEqual(
            [...toolNames].sort(),
            EXPECTED_MCP_TOOLS,
            "MCP tool inventory changed; update this integration test and exercise every tool",
        );
        log("PASS MCP initialize and complete tool inventory");

        const originalSettings = await getMediaSettings();
        settingsToRestore = originalSettings;
        const changedSettings = {
            ...originalSettings,
            useWebP: !originalSettings.useWebP,
        };
        await updateMediaSettings(changedSettings);
        assert.deepEqual(await getMediaSettings(), changedSettings);
        await restoreMediaSettings();
        log("PASS get_media_settings and update_media_settings round trip");

        baseline = await storage();
        baselineCount = await count();
        if (expectedMaxStorage !== undefined) {
            assert.equal(
                baseline.maxStorage,
                expectedMaxStorage,
                "maxStorage must be the storage limit of the account's plan",
            );
            log("PASS maxStorage matches the account's plan");
        }
        assert(
            baseline.maxStorage - baseline.storage >= png.length,
            "Insufficient available storage for the MCP upload",
        );
        assert.deepEqual(
            await list(group),
            [],
            "Run group already contains media",
        );
        await checkWhoami({ ...baseline, files: baselineCount });
        log(
            "PASS get_total_storage, get_media_count, whoami and list_media baseline",
        );

        const signed = await client.callTool("create_upload_signature", {
            group,
        });
        const signature = nonemptyText(signed.signature, "signature");
        uploadAttempted = true;
        const signedFilename = `${group}-signed.png`;
        const signedCaption = `${group}: signed upload`;
        const signedUpload = await uploadWithSignature(
            signature,
            signedFilename,
            signedCaption,
        );
        const signedMediaId = nonemptyText(
            signedUpload.mediaId,
            "signed upload mediaId",
        );
        pending.add(signedMediaId);
        assert.equal(signedUpload.originalFileName, signedFilename);
        assert.equal(signedUpload.size, png.length);
        assert.equal(signedUpload.caption, signedCaption);
        assert.equal(signedUpload.group, group);
        assert.deepEqual(
            await list(group),
            [],
            "Signed draft uploads must stay hidden",
        );
        const signedDelete = await client.callTool("delete_media", {
            mediaId: signedMediaId,
        });
        assert.equal(signedDelete.message, "success");
        pending.delete(signedMediaId);
        await checkTotals(0, 0);
        log("PASS create_upload_signature and delete_media on a signed draft");

        uploadAttempted = true;
        const filename = `${group}.png`;
        const caption = `${group}: MCP integration upload`;
        const uploaded = await client.callTool("upload_media", {
            fileBase64: png.toString("base64"),
            fileName: filename,
            mimeType: "image/png",
            caption,
            access: "private",
            group,
        });
        const mediaId = nonemptyText(uploaded.mediaId, "mediaId");
        pending.add(mediaId);
        assert.equal(uploaded.originalFileName, filename);
        assert.equal(uploaded.size, png.length);
        assert.equal(uploaded.caption, caption);
        assert.equal(uploaded.group, group);
        assert.deepEqual(
            await list(group),
            [],
            "Draft MCP uploads must stay hidden",
        );
        await checkTotals(0, 0);
        log("PASS upload_media and draft visibility");

        const sealed = await client.callTool("seal_media", { mediaId });
        assert.equal(sealed.mediaId, mediaId);
        const retrieved = await client.callTool("get_media", { mediaId });
        assert.equal(retrieved.mediaId, mediaId);
        assert.equal(retrieved.originalFileName, filename);
        assert.equal(retrieved.size, png.length);
        assert.equal(retrieved.group, group);
        assert.deepEqual(
            (await list(group)).map((item) => item.mediaId),
            [mediaId],
        );
        await checkTotals(png.length, 1);
        log("PASS seal_media, get_media, list_media and storage/count totals");

        const deleted = await client.callTool("delete_media", { mediaId });
        assert.equal(deleted.message, "success");
        pending.delete(mediaId);
        const missing = await client.callToolResult("get_media", { mediaId });
        assert.equal(
            missing.isError,
            true,
            "Deleted media must not be retrievable",
        );
        assert.deepEqual(await list(group), []);
        await checkTotals(0, 0);
        log("PASS delete_media and restored storage/count totals");
    } catch (error) {
        failure = error;
    } finally {
        try {
            await restoreMediaSettings();
        } catch (error) {
            cleanupErrors.push(error);
            log(`CLEANUP failed to restore media settings: ${String(error)}`);
        }
        for (const mediaId of pending) {
            try {
                await client.callTool("delete_media", { mediaId });
                pending.delete(mediaId);
                log(`CLEANUP deleted ${mediaId}`);
            } catch (error) {
                cleanupErrors.push(error);
                log(`CLEANUP FAILED for ${mediaId}: ${String(error)}`);
            }
        }
        if (uploadAttempted && baseline && baselineCount !== undefined) {
            try {
                assert.deepEqual(
                    await list(group),
                    [],
                    "Run media remains after cleanup",
                );
                await checkTotals(0, 0);
            } catch (error) {
                cleanupErrors.push(error);
                log(`CLEANUP verification failed: ${String(error)}`);
            }
        }
        try {
            await client.close();
        } catch (error) {
            cleanupErrors.push(error);
            log(`CLEANUP failed to close MCP session: ${String(error)}`);
        }
    }

    if (failure) throw failure;
    if (cleanupErrors.length) {
        throw new AggregateError(
            cleanupErrors,
            "MCP integration cleanup failed",
        );
    }
    log("PASS MediaLit MCP lifecycle; media and session cleaned up");
}
