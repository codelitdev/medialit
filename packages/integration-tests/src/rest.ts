/**
 * Run against a live API (use an API key with no concurrent media writes):
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:rest
 *
 * Only this run's media is deleted. The API counts sealed media in list/count/
 * storage totals, so upload accounting is checked when each upload is sealed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generatePng } from "./utils";
export { generatePng } from "./utils";

type JsonObject = Record<string, unknown>;
type Access = "public" | "private";
interface UploadedMedia {
    mediaId: string;
    filename: string;
    caption: string;
    access: Access;
}
interface Stats {
    storage: number;
    maxStorage: number;
}

function object(value: unknown): JsonObject {
    assert(
        value && typeof value === "object" && !Array.isArray(value),
        "Expected a JSON object",
    );
    return value as JsonObject;
}

function text(value: unknown, label: string): string {
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

export async function runIntegrationTests(
    options: {
        apiKey?: string;
        server?: string;
        log?: (message: string) => void;
    } = {},
): Promise<void> {
    const apiKey = options.apiKey ?? process.env.MEDIALIT_APIKEY;
    assert(apiKey?.trim(), "MEDIALIT_APIKEY is required");
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
    const log = options.log ?? console.log;
    const group = `__integration_${randomUUID()}`;
    const png = generatePng();
    const pending = new Set<string>();
    const uploads: UploadedMedia[] = [];
    let baseline: Stats | undefined;
    let baselineCount: number | undefined;
    let uploadsAttempted = false;
    let failure: unknown;
    const cleanupErrors: unknown[] = [];

    function url(path: string): URL {
        return new URL(path.replace(/^\//, ""), base);
    }

    async function request(
        target: URL,
        init: RequestInit,
        status = 200,
    ): Promise<Response> {
        const response = await fetch(target, {
            ...init,
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
        });
        if (response.status !== status) {
            const detail = (await response.text())
                .split(apiKey!)
                .join("[redacted]");
            throw new Error(
                `${init.method ?? "GET"} ${target.pathname}: expected HTTP ${status}, got ${response.status}: ${detail.slice(0, 1000)}`,
            );
        }
        return response;
    }

    async function api(
        path: string,
        body?: JsonObject,
        method = "POST",
    ): Promise<unknown> {
        const response = await request(url(path), {
            method,
            headers: {
                "x-medialit-apikey": apiKey!,
                "content-type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return response.json();
    }

    async function list(filters: JsonObject = {}): Promise<JsonObject[]> {
        const result = await api("media/get", {
            page: 1,
            limit: 100,
            ...filters,
        });
        assert(Array.isArray(result), "List media must return an array");
        return result.map(object);
    }

    async function stats(): Promise<Stats> {
        const result = object(await api("media/get/size"));
        return {
            storage: integer(result.storage, "storage"),
            maxStorage: integer(result.maxStorage, "maxStorage"),
        };
    }

    async function count(): Promise<number> {
        return integer(object(await api("media/get/count")).count, "count");
    }

    async function checkTotals(bytes: number, files: number): Promise<void> {
        assert(baseline && baselineCount !== undefined);
        const current = await stats();
        assert.equal(
            current.maxStorage,
            baseline.maxStorage,
            "Storage quota changed during the run",
        );
        assert.equal(
            current.storage,
            baseline.storage + bytes,
            "Occupied storage delta is incorrect (check for concurrent writes)",
        );
        assert.equal(
            current.maxStorage - current.storage,
            baseline.maxStorage - baseline.storage - bytes,
            "Available storage delta is incorrect",
        );
        assert.equal(
            await count(),
            baselineCount + files,
            "Media count delta is incorrect",
        );
    }

    function track(value: unknown): JsonObject {
        const media = object(value);
        const id = text(media.mediaId, "mediaId");
        assert(!pending.has(id), "Upload returned a duplicate mediaId");
        pending.add(id); // Track before metadata assertions so failures still clean up.
        return media;
    }

    function checkMedia(media: JsonObject, expected: UploadedMedia): void {
        assert.equal(media.mediaId, expected.mediaId);
        assert.equal(media.originalFileName, expected.filename);
        assert.equal(media.size, png.length);
        assert.equal(media.access, expected.access);
        assert.equal(media.group, group);
        assert.equal(media.caption, expected.caption);
        assert(
            ["image/png", "image/webp"].includes(
                text(media.mimeType, "mimeType"),
            ),
            "Unexpected image MIME type",
        );
        const file = new URL(text(media.file, "file URL"));
        assert(["http:", "https:"].includes(file.protocol));
    }

    async function download(media: JsonObject): Promise<void> {
        // Storage URLs need no API credentials, including signed private URLs.
        const response = await fetch(text(media.file, "file URL"), {
            signal: AbortSignal.timeout(30_000),
        });
        assert.equal(response.status, 200, "File download failed");
        const bytes = Buffer.from(await response.arrayBuffer());
        if (media.mimeType === "image/png") {
            assert.deepEqual(
                bytes,
                png,
                "Downloaded PNG differs from the uploaded bytes",
            );
        } else {
            // Respect existing account WebP conversion settings without changing them.
            assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
            assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
            assert(bytes.length > 12, "Downloaded WebP is empty");
        }
    }

    async function signature(): Promise<string> {
        return text(
            object(await api("media/signature/create", { group })).signature,
            "signature",
        );
    }

    async function upload(
        tus: boolean,
        signed: boolean,
        access: Access,
    ): Promise<void> {
        const label = `${tus ? "tus" : "multipart"}-${signed ? "signature" : "apikey"}`;
        const filename = `${label}.png`;
        const caption = `${group}:${label}`;
        const headers: Record<string, string> = signed
            ? { "x-medialit-signature": await signature() }
            : { "x-medialit-apikey": apiKey! };
        uploadsAttempted = true;
        let media: JsonObject;
        if (tus) {
            const metadata = {
                fileName: filename,
                mimeType: "image/png",
                access,
                caption,
                group,
            };
            const tusHeaders = { ...headers, "Tus-Resumable": "1.0.0" };
            const created = await request(
                url("media/create/resumable"),
                {
                    method: "POST",
                    headers: {
                        ...tusHeaders,
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
                text(created.headers.get("location"), "tus Location"),
                url("media/create/resumable"),
            );
            assert.equal(
                location.origin,
                base.origin,
                "tus Location points to a different origin",
            );
            const split = Math.floor(png.length / 2);
            // A partial PATCH followed by HEAD and a resumed PATCH tests resumability.
            await request(
                location,
                {
                    method: "PATCH",
                    headers: {
                        ...tusHeaders,
                        "content-type": "application/offset+octet-stream",
                        "Upload-Offset": "0",
                    },
                    body: Uint8Array.from(png.subarray(0, split)),
                },
                204,
            );
            const head = await request(location, {
                method: "HEAD",
                headers: tusHeaders,
            });
            assert.equal(head.headers.get("upload-offset"), String(split));
            assert.equal(head.headers.get("upload-length"), String(png.length));
            const completed = await request(
                location,
                {
                    method: "PATCH",
                    headers: {
                        ...tusHeaders,
                        "content-type": "application/offset+octet-stream",
                        "Upload-Offset": String(split),
                    },
                    body: Uint8Array.from(png.subarray(split)),
                },
                204,
            );
            media = track(
                JSON.parse(
                    text(completed.headers.get("media"), "tus media header"),
                ),
            );
            assert.equal(
                completed.headers.get("upload-offset"),
                String(png.length),
            );
        } else {
            const form = new FormData();
            form.set(
                "file",
                new Blob([Uint8Array.from(png)], { type: "image/png" }),
                filename,
            );
            form.set("access", access);
            form.set("caption", caption);
            // Signed uploads obtain the run group from their signature.
            if (!signed) form.set("group", group);
            media = track(
                await (
                    await request(url("media/create"), {
                        method: "POST",
                        headers,
                        body: form,
                    })
                ).json(),
            );
        }
        const expected = {
            mediaId: text(media.mediaId, "mediaId"),
            filename,
            caption,
            access,
        };
        uploads.push(expected);
        checkMedia(media, expected);
        const retrieved = object(
            await api(`media/get/${encodeURIComponent(expected.mediaId)}`),
        );
        checkMedia(retrieved, expected);
        await download(retrieved);
        // Drafts take up storage but are not counted as media.
        await checkTotals(png.length * uploads.length, 0);
        log(`PASS upload and get ${label} (${access})`);
    }

    log(
        `MediaLit integration run ${group} against ${base.origin}${base.pathname}`,
    );
    try {
        baseline = await stats();
        baselineCount = await count();
        assert(
            baseline.maxStorage - baseline.storage >= png.length * 4,
            "Insufficient available storage for four PNGs",
        );
        await list();
        assert.deepEqual(
            await list({ group }),
            [],
            "Run group already contains media",
        );
        log("PASS list media and baseline storage/count");

        await upload(false, false, "public");
        await upload(false, true, "private");
        await upload(true, false, "private");
        await upload(true, true, "public");
        assert.deepEqual(
            await list({ group }),
            [],
            "Unsealed uploads should not be listed",
        );

        for (let index = 0; index < uploads.length; index++) {
            const expected = uploads[index];
            checkMedia(
                object(
                    await api(
                        `media/seal/${encodeURIComponent(expected.mediaId)}`,
                    ),
                ),
                expected,
            );
            await checkTotals(png.length * uploads.length, index + 1);
            log(`PASS seal ${expected.filename} and storage decrement`);
        }
        const listed = await list({ group });
        assert.deepEqual(
            listed.map((media) => media.mediaId).sort(),
            uploads.map((media) => media.mediaId).sort(),
            "List must contain all run media",
        );
        for (const access of ["public", "private"] as const) {
            assert.deepEqual(
                (await list({ group, access }))
                    .map((media) => media.mediaId)
                    .sort(),
                uploads
                    .filter((media) => media.access === access)
                    .map((media) => media.mediaId)
                    .sort(),
            );
        }
        // Exercise pagination on the isolated group.
        const paginated = [];
        for (let page = 1; page <= uploads.length + 1; page++) {
            const items = await list({ group, page, limit: 1 });
            assert.equal(items.length, page <= uploads.length ? 1 : 0);
            paginated.push(...items.map((media) => media.mediaId));
        }
        assert.deepEqual(
            paginated.sort(),
            uploads.map((media) => media.mediaId).sort(),
        );
        for (const expected of uploads) {
            const media = object(
                await api(`media/get/${encodeURIComponent(expected.mediaId)}`),
            );
            checkMedia(media, expected);
            await download(media);
        }
        log(
            "PASS list, pagination, access filters, get and download all sealed media",
        );

        for (let index = 0; index < uploads.length; index++) {
            const { mediaId } = uploads[index];
            assert.equal(
                object(
                    await api(
                        `media/delete/${encodeURIComponent(mediaId)}`,
                        undefined,
                        "DELETE",
                    ),
                ).message,
                "success",
            );
            pending.delete(mediaId);
            await request(
                url(`media/get/${encodeURIComponent(mediaId)}`),
                { method: "POST", headers: { "x-medialit-apikey": apiKey! } },
                404,
            );
            await checkTotals(
                png.length * (uploads.length - index - 1),
                uploads.length - index - 1,
            );
            log(`PASS delete ${mediaId} and storage increment`);
        }
        assert.deepEqual(await list({ group }), []);

        // Camera roll: uploads carry the phone's own asset ID and capture
        // time, so retries cannot duplicate and the timeline orders by capture.
        const assetA = `it-${randomUUID()}`;
        const assetB = `it-${randomUUID()}`;
        const takenA = "2021-01-01T00:00:00.000Z";
        const takenB = "2023-01-01T00:00:00.000Z";
        const authHeaders = { "x-medialit-apikey": apiKey! };

        const form = new FormData();
        form.set(
            "file",
            new Blob([Uint8Array.from(png)], { type: "image/png" }),
            "asset-a.png",
        );
        form.set("access", "private");
        form.set("group", group);
        form.set("assetId", assetA);
        form.set("takenAt", takenA);
        uploadsAttempted = true;
        const mediaA = track(
            await (
                await request(url("media/create"), {
                    method: "POST",
                    headers: authHeaders,
                    body: form,
                })
            ).json(),
        );
        assert.equal(mediaA.assetId, assetA);
        assert.equal(mediaA.takenAt, takenA);
        integer(mediaA.width, "width");
        integer(mediaA.height, "height");

        const tusHeaders = { ...authHeaders, "Tus-Resumable": "1.0.0" };
        const tusMetadata = {
            fileName: "asset-b.png",
            mimeType: "image/png",
            access: "private",
            group,
            assetId: assetB,
            takenAt: takenB,
        };
        const tusCreated = await request(
            url("media/create/resumable"),
            {
                method: "POST",
                headers: {
                    ...tusHeaders,
                    "Upload-Length": String(png.length),
                    "Upload-Metadata": Object.entries(tusMetadata)
                        .map(
                            ([key, value]) =>
                                `${key} ${Buffer.from(value).toString("base64")}`,
                        )
                        .join(","),
                },
            },
            201,
        );
        const tusLocation = new URL(
            text(tusCreated.headers.get("location"), "tus Location"),
            url("media/create/resumable"),
        );
        const tusDone = await request(
            tusLocation,
            {
                method: "PATCH",
                headers: {
                    ...tusHeaders,
                    "content-type": "application/offset+octet-stream",
                    "Upload-Offset": "0",
                },
                body: Uint8Array.from(png),
            },
            204,
        );
        const mediaB = track(
            JSON.parse(text(tusDone.headers.get("media"), "tus media header")),
        );
        assert.equal(mediaB.assetId, assetB);
        assert.equal(mediaB.takenAt, takenB);

        // The same asset again is refused, over both transports, and says
        // what is already there.
        const again = new FormData();
        again.set(
            "file",
            new Blob([Uint8Array.from(png)], { type: "image/png" }),
            "asset-a-again.png",
        );
        again.set("assetId", assetA);
        const conflict = object(
            await (
                await request(
                    url("media/create"),
                    { method: "POST", headers: authHeaders, body: again },
                    409,
                )
            ).json(),
        );
        assert.equal(conflict.error, "asset_exists");
        assert.equal(conflict.mediaId, mediaA.mediaId);
        assert.equal(conflict.sealed, false);
        const tusConflict = await request(
            url("media/create/resumable"),
            {
                method: "POST",
                headers: {
                    ...tusHeaders,
                    "Upload-Length": String(png.length),
                    "Upload-Metadata": Object.entries(tusMetadata)
                        .map(
                            ([key, value]) =>
                                `${key} ${Buffer.from(value).toString("base64")}`,
                        )
                        .join(","),
                },
            },
            409,
        );
        assert.equal(
            object(JSON.parse(await tusConflict.text())).mediaId,
            mediaB.mediaId,
        );
        log("PASS asset IDs, capture time and duplicate refusal");

        const lookup = async () =>
            (
                (await api("media/get/assets", {
                    assetIds: [assetA, assetB, `it-${randomUUID()}`],
                })) as JsonObject[]
            )
                .map(object)
                .sort((left, right) =>
                    String(left.assetId).localeCompare(String(right.assetId)),
                );
        const expectedLookup = (sealed: boolean) =>
            [
                { assetId: assetA, mediaId: mediaA.mediaId, sealed },
                { assetId: assetB, mediaId: mediaB.mediaId, sealed },
            ].sort((left, right) => left.assetId.localeCompare(right.assetId));
        assert.deepEqual(await lookup(), expectedLookup(false));
        for (const media of [mediaA, mediaB]) {
            await api(
                `media/seal/${encodeURIComponent(text(media.mediaId, "mediaId"))}`,
            );
        }
        assert.deepEqual(await lookup(), expectedLookup(true));
        log("PASS asset lookup before and after sealing");

        // Newest capture first, whatever the upload order.
        const timelineUrl = (query: string) =>
            url(`media/timeline?group=${encodeURIComponent(group)}&${query}`);
        const getTimeline = async (query: string, status = 200) =>
            object(
                await (
                    await request(
                        timelineUrl(query),
                        { headers: authHeaders },
                        status,
                    )
                ).json(),
            );
        const first = await getTimeline("limit=1");
        const firstItems = first.items as JsonObject[];
        assert.equal(firstItems.length, 1);
        assert.equal(firstItems[0].mediaId, mediaB.mediaId);
        assert.equal(firstItems[0].takenAt, takenB);
        const cursor = text(first.nextCursor, "nextCursor");
        const second = await getTimeline(
            `limit=1&cursor=${encodeURIComponent(cursor)}`,
        );
        assert.deepEqual(
            (second.items as JsonObject[]).map((item) => item.mediaId),
            [mediaA.mediaId],
        );
        assert.equal(second.nextCursor, null);
        await getTimeline("cursor=forged", 400);
        await getTimeline("limit=0", 400);
        log("PASS timeline order, cursor paging and validation");

        for (const media of [mediaA, mediaB]) {
            const mediaId = text(media.mediaId, "mediaId");
            await api(
                `media/delete/${encodeURIComponent(mediaId)}`,
                undefined,
                "DELETE",
            );
            pending.delete(mediaId);
        }
        assert.deepEqual(await lookup(), []);
        log("PASS camera roll uploads cleaned up");
    } catch (error) {
        failure = error;
    } finally {
        // Continue cleanup after individual failures; never delete preexisting media.
        for (const mediaId of pending) {
            try {
                await api(
                    `media/delete/${encodeURIComponent(mediaId)}`,
                    undefined,
                    "DELETE",
                );
                pending.delete(mediaId);
                log(`CLEANUP deleted ${mediaId}`);
            } catch (error) {
                cleanupErrors.push(error);
                log(`CLEANUP FAILED for ${mediaId}: ${String(error)}`);
            }
        }
        if (uploadsAttempted && baseline && baselineCount !== undefined) {
            try {
                assert.deepEqual(
                    await list({ group }),
                    [],
                    "Run media remains after cleanup",
                );
                await checkTotals(0, 0);
            } catch (error) {
                cleanupErrors.push(error);
                log(`CLEANUP verification failed: ${String(error)}`);
            }
        }
    }
    if (failure) throw failure;
    if (cleanupErrors.length)
        throw new AggregateError(cleanupErrors, "Integration cleanup failed");
    log(
        "PASS MediaLit public API lifecycle; storage and count restored to baseline",
    );
}
