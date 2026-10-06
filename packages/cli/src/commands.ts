import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { lookup } from "mime-types";
import { uploadFile, type UploadedMedia } from "@medialit/uploader";
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
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

export async function upload(paths: string[], flags: Flags): Promise<void> {
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
            : ((await client.seal(media.mediaId)) as unknown as UploadedMedia);
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
    )) as unknown as UploadedMedia;
    output(flags, media, () => media.file);
}

export async function remove(ids: string[], flags: Flags): Promise<void> {
    const { client } = await getClient(flags.endpoint);
    const id = requireId(ids);
    await client.delete(id);
    output(flags, { deleted: true, mediaId: id }, () => `Deleted ${id}.`);
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
