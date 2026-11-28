import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { lookup } from "mime-types";
import { uploadFile, type UploadedMedia } from "@medialit/uploader";
import type {
    HlsRendition,
    MediaSettings,
    MediaSettingsUpdate,
    SealOptions,
    VideoStreaming,
    WebhookEndpoint,
    WebhookEvent,
} from "medialit";
import { loadCredentials, saveCredentials } from "./credentials";
import { authorize, discover, register, revoke } from "./oauth";
import { getClient, resolveEndpoint } from "./session";

export interface Flags {
    endpoint?: string;
    json?: boolean;
    public?: boolean;
    private?: boolean;
    caption?: string;
    group?: string;
    temp?: boolean;
    page?: string;
    limit?: string;
    browser?: boolean;
    url?: string;
    events?: string;
    enable?: boolean;
    disable?: boolean;
    videoStreaming?: string;
    hlsRenditions?: string;
    webp?: string;
    webpQuality?: string;
    captions?: string;
}

export async function login(flags: Flags): Promise<void> {
    const endpoint = await resolveEndpoint(flags.endpoint);
    const metadata = await discover(endpoint);
    const credentials = await loadCredentials();
    const previous = credentials.servers[endpoint];

    const clientId = previous?.clientId || (await register(metadata));
    const tokens = await authorize(metadata, clientId, (url) => {
        log(`Opening your browser to log in to ${endpoint}.`);
        log(`If it doesn't open, visit:\n\n  ${url}\n`);
        if (flags.browser !== false) openBrowser(url);
    });

    credentials.servers[endpoint] = {
        clientId,
        tokenEndpoint: metadata.tokenEndpoint,
        revocationEndpoint: metadata.revocationEndpoint,
        resource: metadata.resource,
        ...tokens,
    };
    credentials.current = endpoint;
    await saveCredentials(credentials);

    output(flags, { endpoint, email: tokens.email, appId: tokens.appId }, () =>
        [
            `Logged in${tokens.email ? ` as ${tokens.email}` : ""}.`,
            tokens.appId ? `Uploads go to app ${tokens.appId}.` : "",
            "Run `medialit login` again to choose a different app.",
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

export async function logout(flags: Flags): Promise<void> {
    const endpoint = await resolveEndpoint(flags.endpoint);
    const credentials = await loadCredentials();
    const server = credentials.servers[endpoint];
    if (server?.refreshToken && server.revocationEndpoint) {
        await revoke(server.revocationEndpoint, {
            clientId: server.clientId,
            token: server.refreshToken,
        }).catch(() => undefined);
    }
    if (server) {
        // Keep the registration so the next login doesn't register again.
        credentials.servers[endpoint] = {
            clientId: server.clientId,
            tokenEndpoint: server.tokenEndpoint,
            revocationEndpoint: server.revocationEndpoint,
            resource: server.resource,
        };
        await saveCredentials(credentials);
    }
    output(flags, { endpoint }, () => `Logged out of ${endpoint}.`);
}

export async function whoami(flags: Flags): Promise<void> {
    const { client, endpoint } = await getClient(flags.endpoint);
    const server = (await loadCredentials()).servers[endpoint];
    const usingApiKey = !!process.env.MEDIALIT_API_KEY;
    const [stats, count] = await Promise.all([
        client.getStats(),
        client.getCount(),
    ]);
    const info = {
        endpoint,
        auth: usingApiKey ? "api-key" : "login",
        email: usingApiKey ? undefined : server?.email,
        appId: usingApiKey ? undefined : server?.appId,
        files: count,
        storage: stats.storage,
        maxStorage: stats.maxStorage,
        processingMinutes: stats.processingMinutes,
    };
    output(flags, info, () =>
        [
            `Server:  ${endpoint}`,
            usingApiKey
                ? "Using:   MEDIALIT_API_KEY"
                : `Account: ${info.email || "unknown"}`,
            info.appId ? `App:     ${info.appId}` : "",
            `Files:   ${count}`,
            `Storage: ${formatBytes(stats.storage)} of ${formatBytes(stats.maxStorage)}`,
            stats.processingMinutes
                ? `Video minutes this month: ${stats.processingMinutes.used}${
                      stats.processingMinutes.allowed === null
                          ? " (no limit)"
                          : ` of ${stats.processingMinutes.allowed}`
                  }`
                : "",
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

const VIDEO_STREAMING: readonly VideoStreaming[] = ["off", "hls", "mp4"];

/** `--video-streaming` and `--captions` on upload and seal override the
 * app's settings for these files only. Checked here, not only by the server, so `upload`
 * refuses a bad value before sending any file. */
export function sealOptions(flags: Flags): SealOptions {
    const processing: NonNullable<SealOptions["processing"]> = {};
    if (flags.videoStreaming !== undefined) {
        const value = flags.videoStreaming
            .trim()
            .toLowerCase() as VideoStreaming;
        if (!VIDEO_STREAMING.includes(value)) {
            throw new Error("--video-streaming must be off, hls or mp4.");
        }
        processing.videoStreaming = value;
    }
    if (flags.captions !== undefined) {
        processing.generateCaptions = onOff(flags.captions, "--captions");
    }
    return Object.keys(processing).length > 0 ? { processing } : {};
}

export async function upload(paths: string[], flags: Flags): Promise<void> {
    const options = sealOptions(flags);
    if (flags.temp && options.processing) {
        throw new Error(
            "--video-streaming and --captions apply when a file is sealed. Pass them to `medialit seal` instead of using --temp.",
        );
    }
    if (!paths.length) throw new Error("Pass at least one file to upload.");
    const { client, endpoint } = await getClient(flags.endpoint);
    const results: UploadedMedia[] = [];

    for (const path of paths) {
        const info = await stat(path).catch(() => null);
        if (!info?.isFile()) throw new Error(`${path} is not a file`);

        const fileName = basename(path);
        const media = await uploadFile(createReadStream(path), {
            getSignature: async () => ({
                signature: await client.getSignature({ group: flags.group }),
                endpoint,
            }),
            fileName,
            mimeType: lookup(fileName) || undefined,
            access: flags.public ? "public" : "private",
            caption: flags.caption,
            // Chunks let a dropped connection resume instead of restarting.
            chunkSize: 8 * 1024 * 1024,
            onProgress: ({ percentage }) =>
                progress(`${fileName}  ${Math.floor(percentage)}%`),
        });
        progress("");

        const kept = flags.temp
            ? media
            : ((await client.seal(
                  media.mediaId,
                  options,
              )) as unknown as UploadedMedia);
        results.push(kept);
        if (!flags.json) {
            log(`${kept.originalFileName}  ${kept.mediaId}`);
            console.log(kept.file);
        }
    }

    if (flags.json) console.log(JSON.stringify(results, null, 2));
    else if (flags.temp) {
        log(
            "\nThese uploads are temporary. Seal them with `medialit seal <id>` or they are deleted after 24 hours.",
        );
    }
}

export async function list(flags: Flags): Promise<void> {
    const { client } = await getClient(flags.endpoint);
    const access = flags.public
        ? "public"
        : flags.private
          ? "private"
          : undefined;
    const media = (await client.list(
        Number(flags.page || 1),
        Number(flags.limit || 20),
        { access, group: flags.group },
    )) as unknown as UploadedMedia[];

    output(flags, media, () =>
        media.length
            ? table(
                  media.map((m) => [
                      m.mediaId,
                      m.access,
                      formatBytes(m.size),
                      m.originalFileName,
                  ]),
              )
            : "No files.",
    );
}

export async function get(ids: string[], flags: Flags): Promise<void> {
    const { client } = await getClient(flags.endpoint);
    const media = (await client.get(
        requireId(ids),
    )) as unknown as UploadedMedia;
    output(flags, media, () => media.file);
}

export async function seal(ids: string[], flags: Flags): Promise<void> {
    const { client } = await getClient(flags.endpoint);
    const media = (await client.seal(
        requireId(ids),
        sealOptions(flags),
    )) as unknown as UploadedMedia;
    output(flags, media, () => media.file);
}

export async function remove(ids: string[], flags: Flags): Promise<void> {
    const { client } = await getClient(flags.endpoint);
    const id = requireId(ids);
    await client.delete(id);
    output(flags, { deleted: true, mediaId: id }, () => `Deleted ${id}.`);
}

const SETTINGS_USAGE =
    "Usage: medialit settings [get|set]. Run `medialit --help`.";

/** `medialit settings` shows the app's media settings; `settings set`
 * changes only the options given. */
export async function settings(args: string[], flags: Flags): Promise<void> {
    const [action = "get", ...rest] = args;
    if (rest.length > 0) throw new Error(SETTINGS_USAGE);
    const { client } = await getClient(flags.endpoint);
    if (action === "get" || action === "show") {
        const current = await client.getSettings();
        output(flags, current, () => describeSettings(current));
        return;
    }
    if (action !== "set") {
        throw new Error(
            `Unknown settings command "${action}". ${SETTINGS_USAGE}`,
        );
    }
    const update = settingsUpdate(flags);
    if (Object.keys(update).length === 0) {
        throw new Error(
            "Pass --video-streaming, --hls-renditions, --webp, --webp-quality or --captions.",
        );
    }
    await client.updateSettings(update);
    const current = await client.getSettings();
    output(flags, current, () => describeSettings(current));
}

/** The settings flags as an update. `default` sets the HLS renditions back
 * to the default sizes. The server checks the values. */
export function settingsUpdate(flags: Flags): MediaSettingsUpdate {
    const update: MediaSettingsUpdate = {};
    if (flags.videoStreaming !== undefined) {
        update.videoStreaming = flags.videoStreaming
            .trim()
            .toLowerCase() as VideoStreaming;
    }
    if (flags.hlsRenditions !== undefined) {
        const value = flags.hlsRenditions.trim();
        update.hlsRenditions =
            value.toLowerCase() === "default"
                ? null
                : (value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean) as HlsRendition[]);
    }
    if (flags.webp !== undefined) {
        const value = flags.webp.trim().toLowerCase();
        if (value !== "on" && value !== "off") {
            throw new Error("--webp takes on or off.");
        }
        update.useWebP = value === "on";
    }
    if (flags.webpQuality !== undefined) {
        update.webpOutputQuality = Number(flags.webpQuality);
    }
    if (flags.captions !== undefined) {
        update.generateCaptions = onOff(flags.captions, "--captions");
    }
    return update;
}

/** `on` or `off`, as a boolean. */
function onOff(value: string, flag: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (normalized !== "on" && normalized !== "off") {
        throw new Error(`${flag} takes on or off.`);
    }
    return normalized === "on";
}

function describeSettings(settings: MediaSettings): string {
    const lines = [
        `WebP:            ${settings.useWebP ? `on (quality ${settings.webpOutputQuality})` : "off"}`,
    ];
    if (settings.videoStreaming) {
        lines.push(
            `Video streaming: ${settings.videoStreaming}`,
            `HLS renditions:  ${(settings.hlsRenditions ?? []).join(", ")}`,
        );
    }
    if (settings.generateCaptions !== undefined) {
        lines.push(
            `Captions:        ${settings.generateCaptions ? "on" : "off"}${
                settings.captionsAvailable === false
                    ? " (this server has no transcription worker)"
                    : ""
            }`,
        );
    }
    return lines.join("\n");
}

const WEBHOOKS_USAGE =
    "Usage: medialit webhooks <ls|create|update|rotate|secret|test|rm>. Run `medialit --help`.";

export async function webhooks(args: string[], flags: Flags): Promise<void> {
    const [action, ...rest] = args;
    switch (action) {
        case "ls":
        case "list":
            return webhooksList(flags);
        case "create":
            return webhooksCreate(rest, flags);
        case "update":
            return webhooksUpdate(rest, flags);
        case "rotate":
            return webhooksRotate(rest, flags);
        case "secret":
            return webhooksSecret(rest, flags);
        case "test":
            return webhooksTest(rest, flags);
        case "rm":
        case "delete":
            return webhooksRemove(rest, flags);
        default:
            throw new Error(
                action
                    ? `Unknown webhooks command "${action}". ${WEBHOOKS_USAGE}`
                    : WEBHOOKS_USAGE,
            );
    }
}

function parseEvents(value: string | undefined): WebhookEvent[] | undefined {
    if (value === undefined) return undefined;
    return value
        .split(",")
        .map((event) => event.trim())
        .filter(Boolean) as WebhookEvent[];
}

function enabledFlag(flags: Flags): boolean | undefined {
    if (flags.enable && flags.disable) {
        throw new Error("Pass --enable or --disable, not both.");
    }
    if (flags.enable) return true;
    if (flags.disable) return false;
    return undefined;
}

function describeEndpoint(endpoint: WebhookEndpoint): string {
    return [
        `ID:      ${endpoint.id}`,
        `URL:     ${endpoint.url}`,
        `Events:  ${endpoint.events.join(", ")}`,
        `Enabled: ${endpoint.enabled ? "yes" : "no"}`,
        endpoint.secret
            ? `Secret:  ${endpoint.secret}`
            : `Secret:  ${endpoint.secretHint} (show it with \`medialit webhooks secret ${endpoint.id}\`)`,
    ].join("\n");
}

async function webhooksList(flags: Flags): Promise<void> {
    const { client } = await getClient(flags.endpoint);
    const endpoints = await client.listWebhooks();
    output(flags, endpoints, () =>
        endpoints.length
            ? table(
                  endpoints.map((endpoint) => [
                      endpoint.id,
                      endpoint.enabled ? "enabled" : "disabled",
                      endpoint.events.join(","),
                      endpoint.url,
                  ]),
              )
            : "No webhook endpoints.",
    );
}

async function webhooksCreate(args: string[], flags: Flags): Promise<void> {
    if (args.length !== 1) throw new Error("Pass the endpoint's URL.");
    const { client } = await getClient(flags.endpoint);
    const endpoint = await client.createWebhook({
        url: args[0],
        events: parseEvents(flags.events),
        enabled: enabledFlag(flags),
    });
    output(flags, endpoint, () => describeEndpoint(endpoint));
}

async function webhooksUpdate(args: string[], flags: Flags): Promise<void> {
    const id = requireWebhookId(args);
    const update = {
        url: flags.url,
        events: parseEvents(flags.events),
        enabled: enabledFlag(flags),
    };
    if (Object.values(update).every((value) => value === undefined)) {
        throw new Error("Pass --url, --events, --enable or --disable.");
    }
    const { client } = await getClient(flags.endpoint);
    const endpoint = await client.updateWebhook(id, update);
    output(flags, endpoint, () => describeEndpoint(endpoint));
}

async function webhooksRotate(args: string[], flags: Flags): Promise<void> {
    const id = requireWebhookId(args);
    const { client } = await getClient(flags.endpoint);
    const endpoint = await client.updateWebhook(id, { rotateSecret: true });
    output(flags, endpoint, () => endpoint.secret ?? "");
}

async function webhooksSecret(args: string[], flags: Flags): Promise<void> {
    const id = requireWebhookId(args);
    const { client } = await getClient(flags.endpoint);
    const secret = await client.revealWebhookSecret(id);
    output(flags, { id, secret }, () => secret);
}

async function webhooksTest(args: string[], flags: Flags): Promise<void> {
    const id = requireWebhookId(args);
    const { client } = await getClient(flags.endpoint);
    const result = await client.testWebhook(id);
    output(flags, result, () =>
        result.result === "delivered"
            ? `Delivered (HTTP ${result.status}).`
            : `Failed (${result.status !== undefined ? `HTTP ${result.status}` : result.error}).`,
    );
}

async function webhooksRemove(args: string[], flags: Flags): Promise<void> {
    const id = requireWebhookId(args);
    const { client } = await getClient(flags.endpoint);
    await client.deleteWebhook(id);
    output(flags, { deleted: true, id }, () => `Deleted ${id}.`);
}

function requireWebhookId(ids: string[]): string {
    if (ids.length !== 1) throw new Error("Pass one webhook endpoint ID.");
    return ids[0];
}

function requireId(ids: string[]): string {
    if (ids.length !== 1) throw new Error("Pass one media ID.");
    return ids[0];
}

function output(flags: Flags, data: unknown, human: () => string) {
    console.log(flags.json ? JSON.stringify(data, null, 2) : human());
}

/** Messages go to stderr so stdout stays clean for piping. */
function log(message: string) {
    console.error(message);
}

function progress(message: string) {
    if (!process.stderr.isTTY) return;
    process.stderr.write(`\r\x1b[2K${message}`);
}

function table(rows: string[][]): string {
    const widths = rows[0].map((_, i) =>
        Math.max(...rows.map((row) => row[i].length)),
    );
    return rows
        .map((row) =>
            row
                .map((cell, i) =>
                    i === row.length - 1 ? cell : cell.padEnd(widths[i]),
                )
                .join("  "),
        )
        .join("\n");
}

export function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const rounded =
        value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1);
    return `${rounded} ${units[unit]}`;
}

function openBrowser(url: string) {
    const [command, args] =
        process.platform === "darwin"
            ? ["open", [url]]
            : process.platform === "win32"
              ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
              : ["xdg-open", [url]];
    try {
        spawn(command, args, { stdio: "ignore", detached: true })
            .on("error", () => undefined)
            .unref();
    } catch {
        // The URL is printed, so the user can open it themselves.
    }
}
