import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// Build a valid transparent RGBA PNG, including PNG chunk checksums. The
// suites use a 64x36 image, large enough for a thumbnail to be made.
export function generatePng(width = 1, height = 1): Buffer {
    function chunk(type: string, data: Buffer): Buffer {
        const payload = Buffer.concat(
            [Buffer.from(type), data].map((bytes) => Uint8Array.from(bytes)),
        );
        let crc = 0xffffffff;
        for (const byte of payload) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
            }
        }
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const checksum = Buffer.alloc(4);
        checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
        return Buffer.concat(
            [length, payload, checksum].map((bytes) => Uint8Array.from(bytes)),
        );
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat(
        [
            Buffer.from("89504e470d0a1a0a", "hex"),
            chunk("IHDR", header),
            // Each row: filter byte 0, then 4 zero bytes per pixel.
            chunk(
                "IDAT",
                deflateSync(new Uint8Array(height * (1 + width * 4))),
            ),
            chunk("IEND", Buffer.alloc(0)),
        ].map((bytes) => Uint8Array.from(bytes)),
    );
}

export type JsonObject = Record<string, unknown>;

export function object(value: unknown, label = "value"): JsonObject {
    assert(
        value && typeof value === "object" && !Array.isArray(value),
        `Expected ${label} to be a JSON object`,
    );
    return value as JsonObject;
}

export function text(value: unknown, label: string): string {
    assert(
        typeof value === "string" && value.length > 0,
        `${label} must be a nonempty string`,
    );
    return value;
}

export function integer(value: unknown, label: string): number {
    assert(
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
        `${label} must be a nonnegative integer`,
    );
    return value;
}

export function isWebp(bytes: Buffer): boolean {
    return (
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP"
    );
}

/** The API key and the server's base URL (ending in a slash) from the
 * options or MEDIALIT_APIKEY and MEDIALIT_SERVER. */
export function serverOptions(options: { apiKey?: string; server?: string }): {
    apiKey: string;
    base: URL;
} {
    const apiKey = options.apiKey ?? process.env.MEDIALIT_APIKEY;
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
    return { apiKey, base };
}

async function fetchWebp(url: unknown, label: string): Promise<void> {
    if (typeof url !== "string" || !url) {
        throw new Error(`${label} must be a URL`);
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Downloading ${label} returned ${response.status}`);
    }
    if (!isWebp(Buffer.from(await response.arrayBuffer()))) {
        throw new Error(`${label} is not a WebP image`);
    }
}

/**
 * Checks the `processing` and `derivatives` fields of an image's media
 * response, and that its thumbnail can be downloaded: from `thumbnail` and
 * from the `thumbnail` derivative. Temp media is `pending`; sealed media
 * with no derivative jobs is `ready`.
 */
export async function checkProcessing(
    media: JsonObject,
    stage: "temp" | "sealed",
): Promise<void> {
    const processing = object(media.processing, "processing");
    const expected = stage === "temp" ? "pending" : "ready";
    if (processing.status !== expected) {
        throw new Error(
            `processing.status is ${String(processing.status)}, expected ${expected}`,
        );
    }
    const derivatives = object(media.derivatives, "derivatives");
    const thumbnail = object(derivatives.thumbnail, "derivatives.thumbnail");
    if (thumbnail.status !== "ready") {
        throw new Error("The thumbnail derivative is not ready");
    }
    if (thumbnail.mimeType !== "image/webp") {
        throw new Error("The thumbnail derivative is not image/webp");
    }
    await fetchWebp(media.thumbnail, "thumbnail");
    await fetchWebp(thumbnail.url, "derivatives.thumbnail.url");
}

/** What each suite's transport (REST, MCP, CLI) provides to manage
 * webhook endpoints. `create` and `update` throw `WebhookRefused` when the
 * server refuses the URL. */
export interface WebhookClient {
    create(input: {
        url: string;
        events?: string[];
        enabled?: boolean;
    }): Promise<Record<string, unknown>>;
    list(): Promise<Record<string, unknown>[]>;
    update(
        id: string,
        input: {
            url?: string;
            events?: string[];
            enabled?: boolean;
            rotateSecret?: boolean;
        },
    ): Promise<Record<string, unknown>>;
    remove(id: string): Promise<void>;
    test(id: string): Promise<Record<string, unknown>>;
    /** Reads an endpoint's secret, where the transport offers it (REST and
     * the CLI; MCP doesn't). */
    reveal?(id: string): Promise<string>;
}

export class WebhookRefused extends Error {}

/** What an endpoint created without `events` gets: media.captions.ready
 * is opt-in (pipelines-phase-2.md, D8). */
const DEFAULT_WEBHOOK_EVENTS = [
    "media.processing.ready",
    "media.processing.failed",
];

/** Checks an endpoint's shape. With `secret`, it must carry the full
 * secret (create and rotate); without, it must not (everything else). */
function checkEndpoint(
    value: unknown,
    expect: { secret: boolean },
): {
    id: string;
    secret?: string;
    secretHint: string;
    url: string;
    events: string[];
    enabled: boolean;
} {
    const endpoint = value as Record<string, unknown>;
    assert.equal(typeof endpoint?.id, "string");
    assert.match(String(endpoint.id), /^wh_/);
    assert.match(String(endpoint.secretHint), /^….{4}$/);
    if (expect.secret) {
        assert.match(String(endpoint.secret), /^whsec_[A-Za-z0-9+/]+=*$/);
        assert.equal(
            endpoint.secretHint,
            `…${String(endpoint.secret).slice(-4)}`,
        );
    } else {
        assert.equal(
            "secret" in endpoint,
            false,
            "Only create and rotate may return the signing secret",
        );
    }
    assert.equal(typeof endpoint.url, "string");
    assert.equal(typeof endpoint.enabled, "boolean");
    assert(Array.isArray(endpoint.events));
    return endpoint as never;
}

/**
 * Creates, lists, updates, rotates, tests and deletes a webhook endpoint
 * through one client, and checks that internal URLs are refused at save.
 * The endpoint's host never resolves (`.invalid`), so the test event fails
 * with a generic error class and no request leaves the server. Deletes
 * only the endpoints it created.
 */
export async function checkWebhooks(
    client: WebhookClient,
    runId: string,
    log: (message: string) => void,
): Promise<void> {
    const created = new Set<string>();
    const url = `https://webhooks-${runId.replace(/[^a-z0-9-]/gi, "").slice(-40)}.invalid/medialit`;
    let failure: unknown;
    try {
        const before = await client.list();
        const endpoint = checkEndpoint(await client.create({ url }), {
            secret: true,
        });
        created.add(endpoint.id);
        assert.equal(endpoint.url, url);
        assert.deepEqual(endpoint.events, DEFAULT_WEBHOOK_EVENTS);
        assert.equal(endpoint.enabled, true);
        const listed = await client.list();
        assert.equal(listed.length, before.length + 1);
        for (const item of listed) checkEndpoint(item, { secret: false });
        const { secret: createdSecret, ...withoutSecret } = endpoint;
        assert.deepEqual(
            listed.find((item) => item.id === endpoint.id),
            withoutSecret,
        );
        if (client.reveal) {
            assert.equal(await client.reveal(endpoint.id), createdSecret);
        }

        const updated = checkEndpoint(
            await client.update(endpoint.id, {
                url: `${url}/v2`,
                events: ["media.processing.failed", "media.captions.ready"],
                enabled: false,
            }),
            { secret: false },
        );
        assert.equal(updated.url, `${url}/v2`);
        assert.deepEqual(updated.events, [
            "media.processing.failed",
            "media.captions.ready",
        ]);
        assert.equal(updated.enabled, false);
        assert.equal(updated.secretHint, endpoint.secretHint);
        const rotated = checkEndpoint(
            await client.update(endpoint.id, { rotateSecret: true }),
            { secret: true },
        );
        assert.notEqual(rotated.secret, createdSecret);
        assert.equal(
            (await client.list()).find((item) => item.id === endpoint.id)
                ?.secretHint,
            rotated.secretHint,
        );
        if (client.reveal) {
            assert.equal(await client.reveal(endpoint.id), rotated.secret);
        }
        log("PASS webhook endpoint create, list, update and secret rotation");

        assert.deepEqual(await client.test(endpoint.id), {
            result: "failed",
            error: "connection_failed",
        });
        log("PASS webhook test event reports only a generic error class");

        let allowsPrivate = false;
        for (const internal of [
            "https://127.0.0.1/hooks",
            "https://2130706433/hooks",
            "https://[::ffff:127.0.0.1]/hooks",
            "https://169.254.169.254/latest/meta-data",
            "https://localhost/hooks",
        ]) {
            try {
                const accepted = checkEndpoint(
                    await client.create({ url: internal }),
                    { secret: true },
                );
                created.add(accepted.id);
                allowsPrivate = true;
            } catch (error) {
                if (!(error instanceof WebhookRefused)) throw error;
            }
        }
        if (allowsPrivate) {
            log(
                "SKIP internal webhook URLs (the server sets WEBHOOK_ALLOW_PRIVATE_NETWORKS)",
            );
        } else {
            log("PASS internal webhook URLs are refused at save");
        }

        await client.remove(endpoint.id);
        created.delete(endpoint.id);
        assert.equal(
            (await client.list()).some((item) => item.id === endpoint.id),
            false,
        );
        log("PASS webhook endpoint delete");
    } catch (error) {
        failure = error;
    } finally {
        for (const id of created) {
            try {
                await client.remove(id);
                log(`CLEANUP deleted webhook ${id}`);
            } catch (error) {
                failure ??= error;
            }
        }
    }
    if (failure) throw failure;
}

/** Longest wait for a rate limit window: the API's window is a minute. */
const MAX_RATE_LIMIT_WAIT_MS = 65_000;
const RATE_LIMIT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch that waits out a 429 and tries again, so a run against a server
 * with the default rate limit, and its cleanup, isn't cut short. The
 * limiter answers before the request is handled, so retrying is safe.
 * `init` is called per attempt, for a fresh timeout signal.
 */
export async function fetchWithRateLimit(
    target: URL | string,
    init: () => RequestInit,
    log: (message: string) => void = console.log,
): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
        const response = await fetch(target, init());
        if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) {
            return response;
        }
        await response.body?.cancel();
        const seconds = Number(
            response.headers.get("retry-after") ??
                response.headers.get("ratelimit-reset"),
        );
        const waitMs =
            Number.isFinite(seconds) && seconds > 0
                ? Math.min(seconds * 1000 + 250, MAX_RATE_LIMIT_WAIT_MS)
                : MAX_RATE_LIMIT_WAIT_MS;
        log(`WAIT rate limited; retrying in ${Math.ceil(waitMs / 1000)}s`);
        await sleep(waitMs);
    }
}

/** Runs a command until it isn't rate limited, waiting a window between
 * tries. */
export async function retryRateLimited<T extends { stderr: string }>(
    run: () => Promise<T>,
    log: (message: string) => void = console.log,
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        const result = await run();
        if (
            !/too_many_requests/.test(result.stderr) ||
            attempt >= RATE_LIMIT_RETRIES
        ) {
            return result;
        }
        log("WAIT rate limited; retrying in 65s");
        await sleep(MAX_RATE_LIMIT_WAIT_MS);
    }
}

/**
 * A short test video made with ffmpeg (`testsrc` and a sine tone), or null
 * when ffmpeg isn't installed. The video suites skip their uploads then.
 */
export function generateVideo(
    options: {
        width?: number;
        height?: number;
        seconds?: number;
        codec?: "h264" | "vp9";
        /** False for a video with no audio stream. */
        audio?: boolean;
    } = {},
): Buffer | null {
    const { width = 640, height = 360, seconds = 2 } = options;
    const codec = options.codec ?? "h264";
    const dir = mkdtempSync(join(tmpdir(), "medialit-video-"));
    const file = join(dir, codec === "vp9" ? "clip.webm" : "clip.mp4");
    try {
        execFileSync(
            "ffmpeg",
            [
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                `testsrc=size=${width}x${height}:rate=25:duration=${seconds}`,
                ...(options.audio === false
                    ? []
                    : [
                          "-f",
                          "lavfi",
                          "-i",
                          `sine=frequency=440:duration=${seconds}`,
                      ]),
                ...(codec === "vp9"
                    ? ["-c:v", "libvpx-vp9", "-deadline", "realtime"]
                    : ["-c:v", "libx264", "-pix_fmt", "yuv420p"]),
                ...(options.audio === false
                    ? []
                    : ["-c:a", codec === "vp9" ? "libopus" : "aac"]),
                "-shortest",
                file,
            ],
            { stdio: "ignore" },
        );
        return readFileSync(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** A WAV of a tone, or null when ffmpeg isn't installed. */
export function generateAudio(seconds = 6): Buffer | null {
    const dir = mkdtempSync(join(tmpdir(), "medialit-audio-"));
    const file = join(dir, "tone.wav");
    try {
        execFileSync(
            "ffmpeg",
            [
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                `sine=frequency=440:duration=${seconds}`,
                "-ac",
                "1",
                file,
            ],
            { stdio: "ignore" },
        );
        return readFileSync(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
