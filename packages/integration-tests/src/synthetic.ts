/**
 * A quick end-to-end check that MediaLit is up, safe to run against
 * production every few minutes:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=https://api.medialit.cloud \
 *   bunx @medialit/integration-tests synthetic
 *
 * It checks /ready, then uploads a tiny public image, seals it, downloads it
 * and deletes it. Use the API key of an app that exists only for monitoring:
 * the synthetic check never changes settings and only deletes files in its own
 * `__synthetic_` groups, including ones left by earlier runs that were cut
 * short.
 *
 * Set MEDIALIT_SYNTHETIC_HEARTBEAT_URL to a heartbeat monitor, such as Better
 * Stack or Healthchecks.io. The synthetic check requests that URL after each passing
 * run and `<url>/fail` after a failing one, so you get alerted both when
 * MediaLit fails and when the synthetic check stops running.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generatePng } from "./utils";

type JsonObject = Record<string, unknown>;

const GROUP_PREFIX = "__synthetic_";
// Sealed synthetic-check files older than this are leftovers from runs that died.
const STALE_AFTER_MS = 60 * 60 * 1000;

export interface SyntheticCheckResult {
    ok: boolean;
    steps: { name: string; ms: number; error?: string }[];
}

export async function runSyntheticCheck(
    options: {
        apiKey?: string;
        server?: string;
        heartbeatUrl?: string;
        log?: (message: string) => void;
    } = {},
): Promise<SyntheticCheckResult> {
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
    const heartbeatUrl =
        options.heartbeatUrl ?? process.env.MEDIALIT_SYNTHETIC_HEARTBEAT_URL;
    const log = options.log ?? console.log;
    // The start time in the group lets later runs tell leftovers from files
    // a concurrent run is still using.
    const group = `${GROUP_PREFIX}${Date.now()}_${randomUUID()}`;
    const png = generatePng();
    const result: SyntheticCheckResult = { ok: true, steps: [] };
    let mediaId: string | undefined;

    function redact(value: string): string {
        return value.split(apiKey!).join("[redacted]");
    }

    async function request(
        path: string,
        init: RequestInit = {},
        status = 200,
    ): Promise<Response> {
        const response = await fetch(new URL(path, base), {
            ...init,
            headers: { "x-medialit-apikey": apiKey!, ...init.headers },
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
        });
        if (response.status !== status) {
            const body = redact(await response.text()).slice(0, 500);
            throw new Error(
                `${init.method ?? "GET"} /${path}: expected HTTP ${status}, got ${response.status}: ${body}`,
            );
        }
        return response;
    }

    async function api(path: string, body?: JsonObject): Promise<unknown> {
        const response = await request(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return response.json();
    }

    async function step(name: string, run: () => Promise<void>) {
        const started = Date.now();
        try {
            await run();
            result.steps.push({ name, ms: Date.now() - started });
            log(`PASS ${name} (${Date.now() - started} ms)`);
        } catch (error) {
            const message = redact(describe(error));
            result.steps.push({
                name,
                ms: Date.now() - started,
                error: message,
            });
            log(`FAIL ${name} (${Date.now() - started} ms): ${message}`);
            throw error;
        }
    }

    log(`MediaLit synthetic check ${group} against ${base.origin}`);
    try {
        await step("ready", async () => {
            const response = await fetch(new URL("ready", base), {
                signal: AbortSignal.timeout(30_000),
            });
            const report = await response.text();
            assert.equal(
                response.status,
                200,
                `/ready returned ${response.status}: ${report.slice(0, 500)}`,
            );
        });

        await step("upload", async () => {
            const form = new FormData();
            form.set(
                "file",
                new Blob([Uint8Array.from(png)], { type: "image/png" }),
                "synthetic-check.png",
            );
            form.set("access", "public");
            form.set("group", group);
            const media = (await (
                await request("media/create", { method: "POST", body: form })
            ).json()) as JsonObject;
            assert.equal(
                typeof media.mediaId,
                "string",
                "upload returned no mediaId",
            );
            mediaId = media.mediaId as string;
            assert.equal(media.size, png.length);
        });

        let fileUrl = "";
        await step("seal", async () => {
            const media = (await api(`media/seal/${mediaId}`)) as JsonObject;
            assert.equal(media.mediaId, mediaId);
            assert.equal(media.access, "public");
            fileUrl = String(media.file);
            assert.match(fileUrl, /^https?:\/\//, "seal returned no file URL");
        });

        await step("download", async () => {
            const response = await fetch(fileUrl, {
                signal: AbortSignal.timeout(30_000),
            });
            assert.equal(
                response.status,
                200,
                `the file URL returned ${response.status}`,
            );
            const bytes = Buffer.from(await response.arrayBuffer());
            assert(
                bytes.toString("base64") === png.toString("base64"),
                "the downloaded file differs from the upload",
            );
        });

        await step("delete", async () => {
            await request(`media/delete/${mediaId}`, { method: "DELETE" });
            mediaId = undefined;
        });
    } catch {
        result.ok = false;
    } finally {
        // Best effort: a run that can't clean up shouldn't hide the real
        // failure, and leftovers are swept on the next run.
        if (mediaId) {
            await request(`media/delete/${mediaId}`, {
                method: "DELETE",
            }).catch(() =>
                log(`CLEANUP could not delete ${mediaId}; the next run will`),
            );
        }
    }

    if (result.ok) {
        await sweepStaleSyntheticFiles().catch((error) =>
            log(
                `CLEANUP could not sweep old synthetic-check files: ${String(error)}`,
            ),
        );
    }

    if (heartbeatUrl) {
        const url = result.ok
            ? heartbeatUrl
            : `${withoutTrailingSlashes(heartbeatUrl)}/fail`;
        try {
            await fetch(url, {
                method: "POST",
                body: JSON.stringify(result),
                headers: { "content-type": "application/json" },
                signal: AbortSignal.timeout(10_000),
            });
            log(`Heartbeat sent (${result.ok ? "up" : "down"})`);
        } catch (error) {
            log(`Heartbeat could not be sent: ${String(error)}`);
        }
    }

    log(
        result.ok
            ? "PASS MediaLit synthetic check"
            : "FAIL MediaLit synthetic check",
    );
    return result;

    /** Deletes sealed synthetic-check files that earlier, interrupted runs left. */
    async function sweepStaleSyntheticFiles(): Promise<void> {
        const media = await api("media/get", {
            page: 1,
            limit: 50,
            group: GROUP_PREFIX,
        });
        assert(Array.isArray(media), "media/get must return an array");
        for (const item of media as JsonObject[]) {
            // Filtering by group matches a prefix, so check it really is ours.
            if (!String(item.group ?? "").startsWith(GROUP_PREFIX)) continue;
            const started = Number(
                String(item.group).slice(GROUP_PREFIX.length).split("_")[0],
            );
            if (!(Date.now() - started > STALE_AFTER_MS)) continue;
            const id = String(item.mediaId);
            await request(`media/delete/${id}`, { method: "DELETE" });
            log(`CLEANUP deleted old synthetic-check file ${id}`);
        }
    }
}

/** fetch reports network failures as "fetch failed" with the reason in cause. */
function describe(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const cause = (
        error as Error & { cause?: { code?: string; message?: string } }
    ).cause;
    const reason = cause?.code ?? cause?.message;
    return reason ? `${error.message} (${reason})` : error.message;
}

// A loop instead of /\/+$/, which is slow on input with many slashes.
function withoutTrailingSlashes(url: string): string {
    let end = url.length;
    while (end > 0 && url[end - 1] === "/") end--;
    return url.slice(0, end);
}
