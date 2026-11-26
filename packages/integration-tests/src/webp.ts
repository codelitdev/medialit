/**
 * WebP at seal and thumbnails, against a live API:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:webp
 *
 * Turns WebP on for the app, then restores its settings. Use a test app
 * with no concurrent media writes.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
    checkProcessing,
    generatePng,
    isWebp,
    type JsonObject,
    object,
    serverOptions,
} from "./utils";

interface MediaSettings {
    useWebP: boolean;
    webpOutputQuality: number;
}

/** MediaLit's one thumbnail size for the 64x36 PNG: 16:9, never enlarged. */
const THUMBNAIL = { width: 64, height: 36 };

/** Width and height from a WebP header. */
export function webpSize(bytes: Buffer): { width: number; height: number } {
    assert(isWebp(bytes), "Not a WebP image");
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
        return {
            width: 1 + bytes.readUIntLE(24, 3),
            height: 1 + bytes.readUIntLE(27, 3),
        };
    }
    if (chunk === "VP8 ") {
        return {
            width: bytes.readUInt16LE(26) & 0x3fff,
            height: bytes.readUInt16LE(28) & 0x3fff,
        };
    }
    assert.equal(chunk, "VP8L", "Unknown WebP chunk");
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
}

export async function runWebpIntegrationTests(
    options: {
        apiKey?: string;
        server?: string;
        log?: (message: string) => void;
    } = {},
): Promise<void> {
    const { apiKey, base } = serverOptions(options);
    const log = options.log ?? console.log;
    const group = `__integration_webp_${randomUUID()}`;
    const png = generatePng(64, 36);
    const created: string[] = [];
    let original: MediaSettings | undefined;

    const url = (path: string) => new URL(path.replace(/^\//, ""), base);

    async function request(
        target: URL,
        init: RequestInit,
        status = 200,
    ): Promise<Response> {
        const response = await fetch(target, {
            ...init,
            redirect: "error",
            signal: AbortSignal.timeout(60_000),
        });
        if (response.status !== status) {
            const detail = (await response.text()).split(apiKey!).join("");
            throw new Error(
                `${init.method ?? "GET"} ${target.pathname}: expected HTTP ${status}, got ${response.status}: ${detail.slice(0, 500)}`,
            );
        }
        return response;
    }

    async function api(path: string, body?: JsonObject, method = "POST") {
        const response = await request(url(path), {
            method,
            headers: {
                "x-medialit-apikey": apiKey!,
                "content-type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return response.json() as Promise<unknown>;
    }

    async function download(fileUrl: unknown): Promise<Buffer> {
        assert(typeof fileUrl === "string" && fileUrl, "Missing file URL");
        const response = await fetch(fileUrl, {
            signal: AbortSignal.timeout(30_000),
        });
        assert.equal(response.status, 200, "File download failed");
        return Buffer.from(await response.arrayBuffer());
    }

    async function storage(): Promise<number> {
        return Number(object(await api("media/get/size")).storage);
    }

    async function formUpload(access: "public" | "private") {
        const form = new FormData();
        form.set(
            "file",
            new Blob([Uint8Array.from(png)], { type: "image/png" }),
            "webp-form.png",
        );
        form.set("access", access);
        form.set("group", group);
        const media = object(
            await (
                await request(url("media/create"), {
                    method: "POST",
                    headers: { "x-medialit-apikey": apiKey! },
                    body: form,
                })
            ).json(),
        );
        created.push(String(media.mediaId));
        return media;
    }

    async function tusUpload(access: "public" | "private") {
        const metadata = {
            fileName: "webp-tus.png",
            mimeType: "image/png",
            access,
            group,
        };
        const headers = {
            "x-medialit-apikey": apiKey!,
            "Tus-Resumable": "1.0.0",
        };
        const createdUpload = await request(
            url("media/create/resumable"),
            {
                method: "POST",
                headers: {
                    ...headers,
                    "Upload-Length": String(png.length),
                    "Upload-Metadata": Object.entries(metadata)
                        .map(
                            ([key, value]) =>
                                `${key} ${Buffer.from(value).toString("base64")}`,
                        )
                        .join(","),
                },
            },
            201,
        );
        const location = new URL(
            String(createdUpload.headers.get("location")),
            url("media/create/resumable"),
        );
        const done = await request(
            location,
            {
                method: "PATCH",
                headers: {
                    ...headers,
                    "content-type": "application/offset+octet-stream",
                    "Upload-Offset": "0",
                },
                body: Uint8Array.from(png),
            },
            204,
        );
        const media = object(JSON.parse(String(done.headers.get("media"))));
        created.push(String(media.mediaId));
        return media;
    }

    /** The upload response describes the original, with its thumbnail. */
    async function checkUploaded(media: JsonObject) {
        assert.equal(media.mimeType, "image/png");
        assert.equal(media.size, png.length);
        assert.match(String(media.file), /\/main\.png(\?|$)/);
        assert.deepEqual(await download(media.file), png);
        const thumb = await download(media.thumbnail);
        assert.deepEqual(webpSize(thumb), THUMBNAIL);
        await checkProcessing(media, "temp");
    }

    /** The seal response describes the WebP. Returns its size. */
    async function checkSealed(media: JsonObject): Promise<number> {
        assert.equal(media.mimeType, "image/webp");
        assert.match(String(media.file), /\/main\.webp(\?|$)/);
        const bytes = await download(media.file);
        assert(isWebp(bytes), "The sealed file is not WebP");
        assert.equal(media.size, bytes.length);
        assert.deepEqual(webpSize(bytes), { width: 64, height: 36 });
        assert.deepEqual(webpSize(await download(media.thumbnail)), THUMBNAIL);
        await checkProcessing(media, "sealed");
        return bytes.length;
    }

    log(`MediaLit WebP run ${group} against ${base.origin}${base.pathname}`);
    let failure: unknown;
    try {
        original = object(
            await api("settings/media/get"),
        ) as unknown as MediaSettings;
        await api("settings/media/create", {
            useWebP: true,
            webpOutputQuality: 80,
            // Thumbnail sizes were a setting once. Older clients may still
            // send them: they are accepted and ignored.
            thumbnailWidth: 160,
            thumbnailHeight: 90,
        });
        const baseline = await storage();

        const uploads = [
            await formUpload("public"),
            await tusUpload("private"),
        ];
        for (const media of uploads) await checkUploaded(media);
        assert.equal(await storage(), baseline + png.length * 2);
        log("PASS uploads keep the original PNG, with a 64x36 thumbnail");

        let sealedBytes = 0;
        for (const media of uploads) {
            const sealed = object(
                await api(
                    `media/seal/${encodeURIComponent(String(media.mediaId))}`,
                ),
            );
            sealedBytes += await checkSealed(sealed);
            const fetched = object(
                await api(
                    `media/get/${encodeURIComponent(String(media.mediaId))}`,
                ),
            );
            assert.equal(fetched.mimeType, "image/webp");
            assert.equal(fetched.size, sealed.size);
        }
        assert.equal(await storage(), baseline + sealedBytes);
        log("PASS seal converts to WebP and storage counts the WebP size");

        const raced = await formUpload("public");
        const results = await Promise.all(
            [1, 2, 3].map(async () =>
                object(
                    await api(
                        `media/seal/${encodeURIComponent(String(raced.mediaId))}`,
                    ),
                ),
            ),
        );
        for (const result of results) {
            assert.deepEqual(result.file, results[0].file);
            assert.equal(result.size, results[0].size);
        }
        await checkSealed(results[0]);
        log("PASS concurrent seals return the same WebP");
    } catch (error) {
        failure = error;
    } finally {
        for (const mediaId of created) {
            try {
                await api(
                    `media/delete/${encodeURIComponent(mediaId)}`,
                    undefined,
                    "DELETE",
                );
            } catch (error) {
                log(`CLEANUP FAILED for ${mediaId}: ${String(error)}`);
                failure ??= error;
            }
        }
        if (original) {
            try {
                await api("settings/media/create", {
                    useWebP: original.useWebP,
                    webpOutputQuality: original.webpOutputQuality,
                });
            } catch (error) {
                log(
                    `CLEANUP failed to restore media settings: ${String(error)}`,
                );
                failure ??= error;
            }
        }
    }
    if (failure) throw failure;
    log("PASS WebP at seal and thumbnails");
}
