import assert from "node:assert/strict";
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

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value as JsonRecord;
}

async function fetchWebp(url: unknown, label: string): Promise<void> {
    if (typeof url !== "string" || !url) {
        throw new Error(`${label} must be a URL`);
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Downloading ${label} returned ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
        bytes.subarray(0, 4).toString("latin1") !== "RIFF" ||
        bytes.subarray(8, 12).toString("latin1") !== "WEBP"
    ) {
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
    media: JsonRecord,
    stage: "temp" | "sealed",
): Promise<void> {
    const processing = record(media.processing, "processing");
    const expected = stage === "temp" ? "pending" : "ready";
    if (processing.status !== expected) {
        throw new Error(
            `processing.status is ${String(processing.status)}, expected ${expected}`,
        );
    }
    const derivatives = record(media.derivatives, "derivatives");
    const thumbnail = record(derivatives.thumbnail, "derivatives.thumbnail");
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
}

export class WebhookRefused extends Error {}

const WEBHOOK_EVENTS = ["media.processing.ready", "media.processing.failed"];

function checkEndpoint(value: unknown): {
    id: string;
    secret: string;
    url: string;
    events: string[];
    enabled: boolean;
} {
    const endpoint = value as Record<string, unknown>;
    assert.equal(typeof endpoint?.id, "string");
    assert.match(String(endpoint.id), /^wh_/);
    assert.match(String(endpoint.secret), /^whsec_[A-Za-z0-9+/]+=*$/);
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
        const endpoint = checkEndpoint(await client.create({ url }));
        created.add(endpoint.id);
        assert.equal(endpoint.url, url);
        assert.deepEqual(endpoint.events, WEBHOOK_EVENTS);
        assert.equal(endpoint.enabled, true);
        const listed = await client.list();
        assert.equal(listed.length, before.length + 1);
        assert.deepEqual(
            listed.find((item) => item.id === endpoint.id),
            endpoint,
        );

        const updated = checkEndpoint(
            await client.update(endpoint.id, {
                url: `${url}/v2`,
                events: ["media.processing.failed"],
                enabled: false,
            }),
        );
        assert.equal(updated.url, `${url}/v2`);
        assert.deepEqual(updated.events, ["media.processing.failed"]);
        assert.equal(updated.enabled, false);
        assert.equal(updated.secret, endpoint.secret);
        const rotated = checkEndpoint(
            await client.update(endpoint.id, { rotateSecret: true }),
        );
        assert.notEqual(rotated.secret, endpoint.secret);
        assert.equal(
            (await client.list()).find((item) => item.id === endpoint.id)
                ?.secret,
            rotated.secret,
        );
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
