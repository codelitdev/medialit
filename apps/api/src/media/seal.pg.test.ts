/**
 * Seal against real Postgres and real S3 storage (pipelines-phase-0.md, D5).
 * Needs JOBS_TEST_DATABASE_URL and the CLOUD_* settings of a MinIO with the
 * `medialit` and `medialit-public` buckets; `bun run test:integration:stack`
 * provides both. `cwebp` and `ffmpeg` are wrapped by scripts that log each
 * call, so the tests can count conversions and make them slow or fail.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    after,
    afterEach,
    before,
    beforeEach,
    describe,
    test,
} from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { findExecutable, readImageInfoFromBuffer } from "@medialit/images";
import {
    createTestPostgres,
    testPostgresUrl,
    type TestPostgres,
} from "../jobs/test-postgres.js";
import * as schema from "../db/schema/index.js";
import type { AppDb } from "../db/client.js";

const realCwebp = findExecutable("cwebp");
const realFfmpeg = findExecutable("ffmpeg");
const realFfprobe = findExecutable("ffprobe");
const skip = !testPostgresUrl
    ? "set JOBS_TEST_DATABASE_URL to run against real Postgres"
    : !process.env.CLOUD_ENDPOINT
      ? "set the CLOUD_* settings of a test MinIO"
      : !realCwebp || !realFfmpeg || !realFfprobe
        ? "cwebp, ffmpeg and ffprobe must be installed"
        : false;

// Loaded in before(), after the environment is set.
let db: typeof import("../db/index.js");
let s3: typeof import("../services/s3.js");
let mediaService: typeof import("./service.js").default;
let seal: typeof import("./seal.js");
let checks: typeof import("../operations/checks.js");
let generateKey: typeof import("./utils/generate-key.js").default;
let makePng: typeof import("../../../../packages/images/lib/test-helpers.js").makePng;

let pgTest: TestPostgres;
let work: string;
let userId: string;
let appId: string;
const realPath = process.env.PATH;
const savedEnv = { ...process.env };

function control(name: string) {
    return path.join(work, "control", name);
}

async function setControl(name: string, value: string | null) {
    if (value === null) await rm(control(name), { force: true });
    else await writeFile(control(name), value);
}

async function logLines(name: string): Promise<string[]> {
    try {
        return (await readFile(path.join(work, name), "utf8"))
            .split("\n")
            .filter(Boolean);
    } catch {
        return [];
    }
}

function alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => Promise<boolean>, ms = 10_000) {
    const deadline = Date.now() + ms;
    while (!(await check())) {
        if (Date.now() > deadline) throw new Error("Timed out waiting");
        await sleep(25);
    }
}

before(async () => {
    if (skip) return;
    work = await mkdtemp(path.join(os.tmpdir(), "seal-pg-"));
    const bin = path.join(work, "bin");
    await mkdir(bin);
    await mkdir(path.join(work, "control"));
    await mkdir(path.join(work, "uploads"));
    // cwebp: logs its pid, can be made slow or to fail, then runs the real one.
    await writeFile(
        path.join(bin, "cwebp"),
        `#!/bin/sh
echo "$$" >> "${work}/cwebp.log"
if [ -f "${control("sleep")}" ]; then sleep "$(cat "${control("sleep")}")"; fi
if [ -f "${control("fail")}" ]; then echo "conversion broke" >&2; exit 1; fi
exec "${realCwebp}" "$@"
`,
    );
    await writeFile(
        path.join(bin, "ffmpeg"),
        `#!/bin/sh
echo "$*" >> "${work}/ffmpeg.log"
if [ -f "${control("ffmpeg-fail")}" ]; then echo "ffmpeg broke" >&2; exit 1; fi
if [ -f "${control("ffmpeg-kill")}" ]; then kill -9 $$; fi
exec "${realFfmpeg}" "$@"
`,
    );
    // ffprobe: can be made slow, to check seal's limit on it.
    await writeFile(
        path.join(bin, "ffprobe"),
        `#!/bin/sh
if [ -f "${control("probe-sleep")}" ]; then sleep "$(cat "${control("probe-sleep")}")"; fi
exec "${realFfprobe}" "$@"
`,
    );
    await chmod(path.join(bin, "ffprobe"), 0o755);
    await chmod(path.join(bin, "cwebp"), 0o755);
    await chmod(path.join(bin, "ffmpeg"), 0o755);
    process.env.PATH = `${bin}${path.delimiter}${realPath}`;
    process.env.TEMP_FILE_DIR_FOR_UPLOADS = path.join(work, "uploads");

    pgTest = await createTestPostgres(testPostgresUrl!);
    db = await import("../db/index.js");
    db.setDb(pgTest.db);
    s3 = await import("../services/s3.js");
    mediaService = (await import("./service.js")).default;
    seal = await import("./seal.js");
    checks = await import("../operations/checks.js");
    generateKey = (await import("./utils/generate-key.js")).default;
    makePng = (await import("../../../../packages/images/lib/test-helpers.js"))
        .makePng;
    const { billingStateSource } = await import("../billing/entitlements.js");
    billingStateSource.read = async () => null;

    const user = await db.createAccount({
        email: `seal-${Date.now()}@example.com`,
    });
    const app = await db.createApp({ userId: user.id, name: "seal tests" });
    userId = user.id;
    appId = app.id;
});

after(async () => {
    process.env.PATH = realPath;
    await pgTest?.drop();
    if (work) await rm(work, { recursive: true, force: true });
});

beforeEach(async () => {
    if (skip) return;
    for (const key of Object.keys(process.env)) {
        if (/^(WEBP_|SEAL_)/.test(key)) delete process.env[key];
    }
    for (const name of ["sleep", "fail", "probe-sleep", "ffmpeg-fail"]) {
        await setControl(name, null);
    }
    await rm(path.join(work, "cwebp.log"), { force: true });
    await rm(path.join(work, "ffmpeg.log"), { force: true });
    await settings({ useWebP: true });
    checks.resetWebpBusyForTests();
});

afterEach(() => {
    if (skip) return;
    delete seal.sealHooks.afterClaim;
    delete seal.sealHooks.beforeSharedWrite;
    delete seal.sealHooks.beforeCommit;
    db.setDb(pgTest.db);
    for (const key of ["WEBP_", "SEAL_"]) {
        for (const name of Object.keys(savedEnv)) {
            if (name.startsWith(key)) process.env[name] = savedEnv[name];
        }
    }
});

async function settings(overrides: {
    useWebP?: boolean;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    videoStreaming?: "off" | "hls" | "mp4";
    hlsRenditions?: string[];
}) {
    await db.upsertMediaSettings({
        userId,
        appId,
        useWebP: overrides.useWebP ?? true,
        webpOutputQuality: 80,
        thumbnailWidth: overrides.thumbnailWidth ?? 100,
        thumbnailHeight: overrides.thumbnailHeight ?? 50,
        videoStreaming: overrides.videoStreaming ?? "off",
        hlsRenditions: overrides.hlsRenditions ?? null,
    });
}

let pngCount = 0;
/** A PNG no other test uploads, so its bytes are distinct. */
function png(width = 200, height = 120): Buffer {
    pngCount += 1;
    return makePng(width + pngCount, height);
}

async function upload(
    body: Buffer,
    options: {
        access?: "public" | "private";
        mimeType?: string;
        fileName?: string;
    } = {},
) {
    const mediaId = await mediaService.upload({
        userId,
        appId,
        body,
        fileName: options.fileName ?? "image.png",
        mimeType: options.mimeType ?? "image/png",
        access: options.access ?? "public",
        caption: "",
    });
    const media = await mediaService.getMediaDetails({
        userId,
        appId,
        mediaId,
    });
    assert.ok(media);
    return media;
}

function sealIt(mediaId: string) {
    return mediaService.sealMedia({ userId, appId, mediaId });
}

/** Every key of the media in a bucket, as names relative to its folder. */
async function files(
    mediaId: string,
    where: "private" | "public",
): Promise<string[]> {
    const prefix = generateKey({
        mediaId,
        path: where === "private" ? "i" : "p",
        filename: "",
    });
    const bucket =
        where === "private"
            ? process.env.CLOUD_BUCKET_NAME
            : process.env.CLOUD_PUBLIC_BUCKET_NAME;
    return (await s3.listKeys(prefix, bucket))
        .map((key) => key.slice(prefix.length))
        .sort();
}

async function bytes(
    mediaId: string,
    where: "private" | "public",
    name: string,
): Promise<Buffer> {
    const result = await s3.getObjectBytes({
        Key: generateKey({
            mediaId,
            path: where === "private" ? "i" : "p",
            filename: name,
        }),
        Bucket:
            where === "private"
                ? process.env.CLOUD_BUCKET_NAME
                : process.env.CLOUD_PUBLIC_BUCKET_NAME,
        maxBytes: 50 * 1024 * 1024,
    });
    assert.equal(result.tooLarge, false);
    return Buffer.from((result as { bytes: Uint8Array }).bytes);
}

async function row(mediaId: string) {
    return await db.getMediaRecord({ userId, appId, mediaId });
}

function isWebp(data: Buffer): boolean {
    return (
        data.toString("ascii", 0, 4) === "RIFF" &&
        data.toString("ascii", 8, 12) === "WEBP"
    );
}

describe("seal", { skip }, () => {
    test("an app that never stored a thumbnail size keeps the old thumbnail sizes", async () => {
        await pgTest.db.execute(
            sql`update media_settings set thumbnail_width = null, thumbnail_height = null where user_id = ${userId} and app_id = ${appId}`,
        );
        const thumbSize = async (mediaId: string) => {
            const info = await readImageInfoFromBuffer(
                await bytes(mediaId, "private", "thumb.webp"),
            );
            return `${info?.width}x${info?.height}`;
        };
        const big = await upload(makePng(1600, 1200));
        assert.equal(await thumbSize(big.mediaId), "853x480");
        const wide = await upload(makePng(640, 200));
        assert.equal(await thumbSize(wide.mediaId), "355x200");
        const pixel = await upload(makePng(1, 1));
        assert.ok(pixel.thumbnail, "a 1x1 image still gets a thumbnail");
        assert.equal(await thumbSize(pixel.mediaId), "1x1");

        const videoPath = path.join(work, "default-size.mp4");
        execFileSync("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x360:duration=1",
            "-pix_fmt",
            "yuv420p",
            videoPath,
        ]);
        const video = await upload(await readFile(videoPath), {
            mimeType: "video/mp4",
            fileName: "clip.mp4",
        });
        assert.equal(await thumbSize(video.mediaId), "1280x720");
    });

    test("upload keeps the original, makes a sized thumbnail and never converts", async () => {
        const original = png();
        const media = await upload(original, { access: "public" });
        assert.equal(media.mimeType, "image/png");
        assert.equal(media.size, original.length);
        assert.match(media.file, /\/main\.png(\?|$)/);
        assert.ok(media.thumbnail, "the upload response has a thumbnail");
        assert.deepEqual(await files(media.mediaId, "private"), [
            "main.png",
            "thumb.webp",
        ]);
        assert.deepEqual(
            await bytes(media.mediaId, "private", "main.png"),
            original,
        );
        const thumb = await readImageInfoFromBuffer(
            await bytes(media.mediaId, "private", "thumb.webp"),
        );
        assert.deepEqual([thumb?.width, thumb?.height], [100, 50]);
        assert.deepEqual(
            await logLines("cwebp.log"),
            [],
            "a temp image is never converted",
        );
        assert.equal((await row(media.mediaId))?.processingStatus, "pending");
    });

    test("upload, seal and delete each send one event with only allowlisted properties", async () => {
        const events = await import("../services/events.js");
        const sent: Array<{
            event: string;
            subjectId?: unknown;
            groups?: Record<string, unknown>;
            properties?: Record<string, unknown>;
        }> = [];
        const restore = events.setEventSinkForTests((input) => {
            sent.push(input);
        });
        try {
            const media = await upload(png(), {
                access: "public",
                fileName: "secret-holiday.png",
            });
            await sealIt(media.mediaId);
            await mediaService.deleteMedia({
                userId,
                appId,
                mediaId: media.mediaId,
            });
            await events.flushEventsForTests();

            assert.deepEqual(
                sent.map((e) => e.event),
                ["media.uploaded", "media.sealed", "media.deleted"],
            );
            const app = await db.getAppById(appId);
            for (const event of sent) {
                assert.equal(event.subjectId, userId);
                assert.deepEqual(event.groups, { app: app?.appId });
                assert.equal(event.properties?.media_id, media.mediaId);
                assert.equal(event.properties?.app_id, appId);
                assert.doesNotMatch(
                    JSON.stringify(event),
                    /secret-holiday|https?:/,
                );
            }
            assert.deepEqual(
                {
                    transport: sent[0].properties?.transport,
                    media_kind: sent[0].properties?.media_kind,
                    thumbnail: sent[0].properties?.thumbnail,
                },
                { transport: "mcp", media_kind: "image", thumbnail: "made" },
            );
            assert.equal(sent[1].properties?.webp, "converted");
            assert.equal(sent[1].properties?.access, "public");
            assert.equal(typeof sent[1].properties?.duration_ms, "number");
            assert.equal(sent[2].properties?.temp, false);
        } finally {
            restore();
        }
    });

    test("seal reads metadata: ffprobe for video, the header for images", async () => {
        const videoPath = path.join(work, "metadata.mp4");
        execFileSync("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x180:rate=25:duration=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            videoPath,
        ]);
        const video = await upload(await readFile(videoPath), {
            mimeType: "video/mp4",
            fileName: "metadata.mp4",
            access: "public",
        });
        assert.equal(video.metadata, null, "temp media has no metadata");
        const sealedVideo = await sealIt(video.mediaId);
        const meta = sealedVideo.metadata as Record<string, unknown>;
        assert.equal(meta.kind, "video");
        assert.equal(meta.width, 320);
        assert.equal(meta.height, 180);
        assert.equal(meta.videoCodec, "h264");
        assert.equal(meta.audioCodec, "aac");
        assert.equal(meta.frameRate, 25);
        assert.ok(Math.abs(Number(meta.durationSeconds) - 2) < 0.2);
        // Stored, so later reads return it too.
        assert.deepEqual((await row(video.mediaId))?.metadata, meta);

        const image = await upload(png(300, 200), { access: "private" });
        const sealedImage = await sealIt(image.mediaId);
        assert.deepEqual(sealedImage.metadata, {
            kind: "image",
            width: 300 + pngCount,
            height: 200,
            format: "webp",
        });

        await settings({ useWebP: false });
        const kept = await upload(png(120, 80));
        assert.deepEqual((await sealIt(kept.mediaId)).metadata, {
            kind: "image",
            width: 120 + pngCount,
            height: 80,
            format: "png",
        });
    });

    test("a file that can't be read, or a slow ffprobe, still seals without metadata", async () => {
        const broken = await upload(Buffer.from("not really a video"), {
            mimeType: "video/mp4",
            fileName: "broken.mp4",
        });
        const sealedBroken = await sealIt(broken.mediaId);
        assert.equal(sealedBroken.metadata, null);
        assert.equal((await row(broken.mediaId))?.temp, false);

        const videoPath = path.join(work, "slow-probe.mp4");
        execFileSync("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=160x90:duration=1",
            "-pix_fmt",
            "yuv420p",
            videoPath,
        ]);
        const slow = await upload(await readFile(videoPath), {
            mimeType: "video/mp4",
            fileName: "slow.mp4",
        });
        await setControl("probe-sleep", "10");
        const startedAt = Date.now();
        const sealedSlow = await sealIt(slow.mediaId);
        const took = Date.now() - startedAt;
        assert.equal(sealedSlow.metadata, null);
        assert.ok(
            took < seal.SEAL_PROBE_TIMEOUT_MS + 3_000,
            `seal waited ${took} ms for ffprobe`,
        );
    });

    /** A 10 s video whose first 3 s are black. */
    async function blackStartVideo(): Promise<Buffer> {
        const file = path.join(work, "black-start.mp4");
        execFileSync(realFfmpeg!, [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:size=320x180:rate=25:duration=3",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x180:rate=25:duration=7",
            "-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0",
            "-pix_fmt",
            "yuv420p",
            file,
        ]);
        return await readFile(file);
    }

    /** Average luma of a WebP in the bucket, 0-255. */
    async function luma(mediaId: string, where: "private" | "public") {
        const file = path.join(work, `luma-${mediaId}.webp`);
        await writeFile(file, await bytes(mediaId, where, "thumb.webp"));
        const out = execFileSync(
            realFfmpeg!,
            [
                "-v",
                "error",
                "-i",
                file,
                "-vf",
                "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
                "-f",
                "null",
                "-",
            ],
            { encoding: "utf8" },
        );
        return Number(/YAVG=([\d.]+)/.exec(out)?.[1]);
    }

    /** Runs the jobs seal queued for a media item, as the worker would:
     * its poster, then media.publish. */
    async function runPosterAndPublish(mediaId: string) {
        const { posterJob } = await import("./poster.js");
        const derivatives = await import("./derivatives.js");
        const record = await row(mediaId);
        assert.ok(record);
        const [job] = (
            await pgTest.db.execute(
                sql`SELECT id, payload, priority, max_attempts FROM jobs
                    WHERE media_id = ${record.id} AND type = 'media.poster'`,
            )
        ).rows as Array<{
            id: string;
            payload: { derivative: string; params: Record<string, unknown> };
            priority: number;
            max_attempts: number;
        }>;
        assert.ok(job, "seal queued a poster job");
        await posterJob
            .handler(job.payload, {
                job: {
                    id: job.id,
                    mediaId: record.id,
                    attempts: 1,
                    maxAttempts: job.max_attempts,
                } as never,
                signal: new AbortController().signal,
                workerId: "test",
            })
            .catch(() => undefined);
        await derivatives.publishDerivatives(record.id);
        return job;
    }

    test("sealing a video queues a poster that replaces the public thumb.webp with a frame that isn't black", async () => {
        const video = await upload(await blackStartVideo(), {
            mimeType: "video/mp4",
            fileName: "black-start.mp4",
            access: "public",
        });
        const sealed = await sealIt(video.mediaId);
        assert.deepEqual(sealed.processing, { status: "processing" });
        assert.equal(sealed.derivatives.thumbnail.status, "queued");
        // The upload thumbnail is the black first frame.
        assert.ok((await luma(video.mediaId, "public")) < 32);

        const job = await runPosterAndPublish(video.mediaId);
        assert.equal(job.payload.derivative, "thumbnail");
        assert.equal(job.payload.params.publicKey, "thumb.webp");
        assert.equal(job.payload.params.thumbnailWidth, 100);
        assert.equal(job.payload.params.durationSeconds, 10);
        // Free-plan jobs run after paid and self-hosted ones.
        const { resolveAccountPlan } = await import(
            "../billing/entitlements.js"
        );
        const { priorityFor } = await import("./processing-plan.js");
        assert.equal(
            job.priority,
            priorityFor(await resolveAccountPlan({ id: userId })),
        );

        assert.ok((await luma(video.mediaId, "public")) > 32);
        assert.deepEqual(await files(video.mediaId, "private"), []);
        const after = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        assert.deepEqual(after?.processing, { status: "ready" });
        assert.equal(after?.derivatives.thumbnail.status, "ready");
        assert.match(
            String(after?.derivatives.thumbnail.url),
            /\/thumb\.webp$/,
        );
        assert.equal(after?.thumbnail, after?.derivatives.thumbnail.url);
    });

    test("a poster that finishes before seal cleans up still ends up public", async () => {
        const video = await upload(await blackStartVideo(), {
            mimeType: "video/mp4",
            fileName: "race.mp4",
            access: "private",
        });
        // Run the poster and publish between seal's commit and its cleanup
        // of the private bucket.
        seal.sealHooks.afterCommit = async () => {
            delete seal.sealHooks.afterCommit;
            await runPosterAndPublish(video.mediaId);
        };
        await sealIt(video.mediaId);
        assert.ok((await luma(video.mediaId, "public")) > 32);
        const after = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        assert.equal(after?.derivatives.thumbnail.status, "ready");
        assert.deepEqual(after?.processing, { status: "ready" });
    });

    test("a failed poster keeps the upload thumbnail and settles the media ready", async () => {
        const video = await upload(await blackStartVideo(), {
            mimeType: "video/mp4",
            fileName: "fails.mp4",
        });
        await sealIt(video.mediaId);
        const before = await bytes(video.mediaId, "public", "thumb.webp");
        await setControl("ffmpeg-fail", "1");
        await runPosterAndPublish(video.mediaId);
        await setControl("ffmpeg-fail", null);
        const after = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        assert.equal(after?.derivatives.thumbnail.status, "failed");
        // D12: a failed poster leaves the media usable.
        assert.equal(after?.processing.status, "ready");
        assert.match(String(after?.processing.error), /^thumbnail: /);
        assert.deepEqual(
            await bytes(video.mediaId, "public", "thumb.webp"),
            before,
        );
    });

    test("a poster gives a video whose upload thumbnail failed its thumbnail", async () => {
        await setControl("ffmpeg-fail", "1");
        const video = await upload(await blackStartVideo(), {
            mimeType: "video/mp4",
            fileName: "no-thumb.mp4",
        });
        await setControl("ffmpeg-fail", null);
        assert.equal(video.thumbnail, "");
        await sealIt(video.mediaId);
        await runPosterAndPublish(video.mediaId);
        const after = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        assert.match(String(after?.thumbnail), /\/thumb\.webp/);
        assert.ok((await luma(video.mediaId, "public")) > 32);
    });

    /** Runs one job seal queued, as the worker would. Returns the error it
     * threw, if any. */
    async function runJob(
        mediaId: string,
        type: string,
        attempts = 1,
    ): Promise<{ id: string; error?: unknown }> {
        const definitions = (await import("../jobs/definitions.js"))
            .jobDefinitions;
        const definition = definitions.find((d) => d.type === type);
        assert.ok(definition, `no job type ${type}`);
        const record = await row(mediaId);
        assert.ok(record);
        const [job] = (
            await pgTest.db.execute(
                sql`SELECT id, payload, max_attempts FROM jobs
                    WHERE media_id = ${record.id} AND type = ${type}`,
            )
        ).rows as Array<{ id: string; payload: unknown; max_attempts: number }>;
        assert.ok(job, `seal queued ${type}`);
        try {
            await definition.handler(job.payload as never, {
                job: {
                    id: job.id,
                    mediaId: record.id,
                    attempts,
                    maxAttempts: job.max_attempts,
                } as never,
                signal: new AbortController().signal,
                workerId: "test",
            });
            return { id: job.id };
        } catch (error) {
            return { id: job.id, error };
        }
    }

    function makeVideo(
        name: string,
        size: string,
        codec: string[],
        audio: string[] = [],
    ): Promise<Buffer> {
        const file = path.join(work, name);
        execFileSync(realFfmpeg!, [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            `testsrc=size=${size}:rate=25:duration=2`,
            ...(audio.length
                ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=2"]
                : []),
            ...codec,
            ...audio,
            "-shortest",
            file,
        ]);
        return readFile(file);
    }

    const h264 = () =>
        makeVideo(
            "h264.mp4",
            "640x360",
            ["-c:v", "libx264", "-pix_fmt", "yuv420p"],
            ["-c:a", "aac"],
        );
    const vp9 = () =>
        makeVideo("vp9.webm", "640x360", [
            "-c:v",
            "libvpx-vp9",
            "-deadline",
            "realtime",
        ]);

    async function minutesUsed(): Promise<number> {
        const { minutesUsed } = await import(
            "../billing/processing-minutes.js"
        );
        return await minutesUsed(userId);
    }

    test("mp4: an H.264/AAC upload is remuxed for free, a VP9 one is re-encoded and charged", async () => {
        await settings({ videoStreaming: "mp4" });
        const used = await minutesUsed();

        const remuxed = await upload(await h264(), {
            mimeType: "video/mp4",
            fileName: "h264.mp4",
            access: "public",
        });
        const sealed = await sealIt(remuxed.mediaId);
        assert.equal(sealed.derivatives.mp4.status, "queued");
        assert.equal(
            (await runJob(remuxed.mediaId, "media.mp4")).error,
            undefined,
        );
        await runJob(remuxed.mediaId, "media.poster");
        const derivatives = await import("./derivatives.js");
        await derivatives.publishDerivatives((await row(remuxed.mediaId))!.id);
        const done = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: remuxed.mediaId,
        });
        assert.equal(done?.derivatives.mp4.status, "ready");
        assert.equal(done?.derivatives.mp4.mimeType, "video/mp4");
        assert.deepEqual(done?.processing, { status: "ready" });
        // Public media: the MP4 is published next to the original.
        assert.deepEqual(await files(remuxed.mediaId, "public"), [
            "main.mp4",
            "thumb.webp",
            "web.mp4",
        ]);
        const web = await bytes(remuxed.mediaId, "public", "web.mp4");
        assert.ok(web.indexOf("moov") < web.indexOf("mdat"));
        assert.equal(await minutesUsed(), used, "a remux is free");

        const encoded = await upload(await vp9(), {
            mimeType: "video/webm",
            fileName: "vp9.webm",
            access: "private",
        });
        await sealIt(encoded.mediaId);
        assert.equal(
            (await runJob(encoded.mediaId, "media.mp4")).error,
            undefined,
        );
        assert.equal(await minutesUsed(), used + 1, "a 2 s encode is 1 minute");
        assert.deepEqual(await files(encoded.mediaId, "private"), [
            "main.webm",
            "web.mp4",
        ]);
    });

    test("mp4: a source over VIDEO_MAX_SOURCE_BYTES fails for good, unread, and the media settles ready", async () => {
        await settings({ videoStreaming: "mp4" });
        const video = await upload(await vp9(), {
            mimeType: "video/webm",
            fileName: "big.webm",
        });
        await sealIt(video.mediaId);
        process.env.VIDEO_MAX_SOURCE_BYTES = "1000";
        const { error } = await runJob(video.mediaId, "media.mp4");
        delete process.env.VIDEO_MAX_SOURCE_BYTES;
        const { JobError } = await import("../jobs/errors.js");
        assert.ok(error instanceof JobError);
        assert.equal(error.retryable, false);
        assert.equal(error.reason, "source_too_large");
        await runJob(video.mediaId, "media.poster");
        const done = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        assert.equal(done?.derivatives.mp4.status, "failed");
        assert.match(String(done?.derivatives.mp4.error), /^source_too_large/);
        // D12: our limit, not the file's fault.
        assert.equal(done?.processing.status, "ready");
    });

    test("mp4: out of processing minutes fails for good, charges nothing, and the media settles ready", async () => {
        await settings({ videoStreaming: "mp4" });
        const video = await upload(await vp9(), {
            mimeType: "video/webm",
            fileName: "no-minutes.webm",
        });
        await sealIt(video.mediaId);
        const used = await minutesUsed();
        const saved = process.env.PROCESSING_MINUTES_FREE;
        const savedPaid = process.env.PROCESSING_MINUTES_PAID;
        process.env.PROCESSING_MINUTES_FREE = String(used);
        process.env.PROCESSING_MINUTES_PAID = String(used);
        const { error } = await runJob(video.mediaId, "media.mp4");
        if (saved === undefined) delete process.env.PROCESSING_MINUTES_FREE;
        else process.env.PROCESSING_MINUTES_FREE = saved;
        if (savedPaid === undefined) delete process.env.PROCESSING_MINUTES_PAID;
        else process.env.PROCESSING_MINUTES_PAID = savedPaid;
        const { resolveAccountPlan } = await import(
            "../billing/entitlements.js"
        );
        if ((await resolveAccountPlan({ id: userId })) === "oss") {
            // Self-hosted has no limit; nothing to check here.
            assert.equal(error, undefined);
            return;
        }
        const { JobError } = await import("../jobs/errors.js");
        assert.ok(error instanceof JobError);
        assert.equal(error.reason, "out_of_processing_minutes");
        assert.equal(await minutesUsed(), used);
        await runJob(video.mediaId, "media.poster");
        const done = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        assert.match(
            String(done?.derivatives.mp4.error),
            /^out_of_processing_minutes/,
        );
        assert.equal(done?.processing.status, "ready");
    });

    test("mp4: ffmpeg exiting with an error fails for good and gives the minutes back; killed by a signal, it is retried", async () => {
        await settings({ videoStreaming: "mp4" });
        const { JobError } = await import("../jobs/errors.js");
        const video = await upload(await vp9(), {
            mimeType: "video/webm",
            fileName: "breaks.webm",
        });
        await sealIt(video.mediaId);
        const used = await minutesUsed();

        await writeFile(control("ffmpeg-kill"), "1");
        const killed = await runJob(video.mediaId, "media.mp4");
        await rm(control("ffmpeg-kill"), { force: true });
        assert.ok(killed.error instanceof JobError);
        assert.equal(killed.error.retryable, true);
        assert.equal(killed.error.reason, "internal");
        // Kept for the retry, which reuses the reservation.
        assert.equal(await minutesUsed(), used + 1);

        await setControl("ffmpeg-fail", "1");
        const failed = await runJob(video.mediaId, "media.mp4", 2);
        await setControl("ffmpeg-fail", null);
        assert.ok(failed.error instanceof JobError);
        assert.equal(failed.error.retryable, false);
        assert.equal(failed.error.reason, "bad_input");
        assert.equal(await minutesUsed(), used, "a failed encode is free");
        await runJob(video.mediaId, "media.poster");
        const done = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        // The file's fault: the media settles failed, the original stays.
        assert.equal(done?.processing.status, "failed");
        assert.equal(done?.derivatives.mp4.status, "failed");
    });

    test("hls: a 360p video gets the renditions that fit, as fMP4, and a signed playlist URL", async () => {
        await settings({
            videoStreaming: "hls",
            hlsRenditions: ["720p", "480p", "360p"],
        });
        const used = await minutesUsed();
        const video = await upload(await h264(), {
            mimeType: "video/mp4",
            fileName: "hls.mp4",
            access: "private",
        });
        const sealed = await sealIt(video.mediaId);
        assert.equal(sealed.derivatives.hls.status, "queued");
        assert.equal(
            (await runJob(video.mediaId, "media.hls")).error,
            undefined,
        );
        await runJob(video.mediaId, "media.poster");

        const stored = await files(video.mediaId, "private");
        // 640x360: 720p and 480p are larger than the source.
        const playlists = stored.filter(
            (f) => f.startsWith("hls/") && !f.includes("seg"),
        );
        assert.deepEqual(playlists.slice(0, 2), [
            "hls/master.m3u8",
            "hls/v0/index.m3u8",
        ]);
        // ffmpeg names a lone rendition's init file init.mp4, others
        // init_{n}.mp4.
        assert.match(playlists[2], /^hls\/v0\/init(_0)?\.mp4$/);
        assert.equal(playlists.length, 3, "one rendition only");
        assert.ok(stored.includes("hls/v0/seg00000.m4s"));
        const master = (
            await bytes(video.mediaId, "private", "hls/master.m3u8")
        ).toString("utf8");
        assert.match(master, /RESOLUTION=640x360/);
        assert.equal(await minutesUsed(), used + 1);

        const done = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: video.mediaId,
        });
        const hls = done?.derivatives.hls;
        assert.equal(hls?.status, "ready");
        assert.ok((hls?.size ?? 0) > 0);
        assert.match(
            String(hls?.url),
            new RegExp(
                `/media/${video.mediaId}/hls/\\d+\\.[A-Za-z0-9_-]{43}/master\\.m3u8$`,
            ),
        );
        assert.deepEqual(done?.processing, { status: "ready" });
    });

    test("sealing a public image publishes only main.webp", async () => {
        const original = png();
        const media = await upload(original, { access: "public" });
        const before = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId: media.mediaId,
        });
        const totalBefore = await db.totalMediaSize({ userId });
        const sealed = await sealIt(media.mediaId);

        assert.equal(sealed.mimeType, "image/webp");
        assert.match(sealed.file, /\/main\.webp$/);
        assert.deepEqual(await files(media.mediaId, "public"), [
            "main.webp",
            "thumb.webp",
        ]);
        assert.deepEqual(
            await files(media.mediaId, "private"),
            [],
            "no main file and no seal/ keys left",
        );
        const webp = await bytes(media.mediaId, "public", "main.webp");
        assert.ok(isWebp(webp));
        assert.equal(sealed.size, webp.length);
        const record = await row(media.mediaId);
        assert.equal(record?.fileName, "main.webp");
        assert.equal(record?.size, webp.length);
        assert.equal(record?.processingStatus, "ready");
        assert.equal(record?.processingError, undefined);
        assert.equal(
            await db.totalMediaSize({ userId }),
            totalBefore - original.length + webp.length,
        );
        assert.equal((await logLines("cwebp.log")).length, 1);
        assert.ok(before?.thumbnail && sealed.thumbnail);

        // The public URL serves the WebP.
        const served = Buffer.from(
            await (await fetch(sealed.file)).arrayBuffer(),
        );
        assert.deepEqual(served, webp);
        // Sealing again returns the same media and converts nothing.
        assert.deepEqual(await sealIt(media.mediaId), sealed);
        assert.equal((await logLines("cwebp.log")).length, 1);
    });

    test("sealing a private image leaves only main.webp in the private bucket", async () => {
        const media = await upload(png(), { access: "private" });
        const sealed = await sealIt(media.mediaId);
        assert.equal(sealed.mimeType, "image/webp");
        assert.deepEqual(await files(media.mediaId, "private"), ["main.webp"]);
        assert.deepEqual(await files(media.mediaId, "public"), ["thumb.webp"]);
        const webp = await bytes(media.mediaId, "private", "main.webp");
        assert.ok(isWebp(webp));
        assert.equal(sealed.size, webp.length);
        const served = Buffer.from(
            await (await fetch(sealed.file)).arrayBuffer(),
        );
        assert.deepEqual(served, webp, "the signed URL serves the WebP");
    });

    test("a failed conversion keeps the original, seals, and reports failed", async () => {
        await setControl("fail", "1");
        const original = png();
        const media = await upload(original, { access: "public" });
        const sealed = await sealIt(media.mediaId);
        assert.equal(sealed.mimeType, "image/png");
        assert.equal(sealed.size, original.length);
        assert.match(sealed.file, /\/main\.png$/);
        assert.deepEqual(await files(media.mediaId, "public"), [
            "main.png",
            "thumb.webp",
        ]);
        assert.deepEqual(await files(media.mediaId, "private"), []);
        assert.deepEqual(
            Buffer.from(await (await fetch(sealed.file)).arrayBuffer()),
            original,
        );
        const record = await row(media.mediaId);
        assert.equal(record?.fileName, "main.png");
        assert.equal(record?.processingStatus, "failed");
        assert.match(record?.processingError ?? "", /conversion broke/);
    });

    test("a conversion over WEBP_TIMEOUT_MS is killed, keeps the original, and leaves no cwebp running", async () => {
        process.env.WEBP_TIMEOUT_MS = "300";
        await setControl("sleep", "30");
        const original = png();
        const media = await upload(original, { access: "private" });
        const started = Date.now();
        const sealed = await sealIt(media.mediaId);
        assert.ok(Date.now() - started < 10_000);
        assert.equal(sealed.mimeType, "image/png");
        assert.deepEqual(await files(media.mediaId, "private"), ["main.png"]);
        const record = await row(media.mediaId);
        assert.equal(record?.processingStatus, "failed");
        assert.match(record?.processingError ?? "", /timed out/);
        const pids = (await logLines("cwebp.log")).map(Number);
        assert.equal(pids.length, 1);
        assert.equal(alive(pids[0]), false, "no cwebp process is left");
    });

    test("an image over WEBP_MAX_INPUT_BYTES keeps the original and seals ready", async () => {
        process.env.WEBP_MAX_INPUT_BYTES = "100";
        const original = png();
        const media = await upload(original, { access: "public" });
        const sealed = await sealIt(media.mediaId);
        assert.equal(sealed.mimeType, "image/png");
        assert.equal(sealed.size, original.length);
        const record = await row(media.mediaId);
        assert.equal(record?.processingStatus, "ready");
        assert.match(record?.processingError ?? "", /over the WebP limit/);
        assert.deepEqual(await logLines("cwebp.log"), []);
    });

    test("a small PNG with huge dimensions is never decoded, and seals with the original", async () => {
        const bomb = makePng(30_000, 30_000, 1);
        assert.ok(bomb.length < 5000);
        const media = await upload(bomb, { access: "public" });
        assert.equal(
            media.thumbnail,
            "",
            "no thumbnail: the image was not decoded",
        );
        const sealed = await sealIt(media.mediaId);
        assert.equal(sealed.mimeType, "image/png");
        assert.deepEqual(await files(media.mediaId, "public"), ["main.png"]);
        const record = await row(media.mediaId);
        assert.equal(record?.processingStatus, "ready");
        assert.match(record?.processingError ?? "", /30000×30000 pixels/);
        assert.deepEqual(await logLines("cwebp.log"), [], "cwebp never ran");
        assert.deepEqual(await logLines("ffmpeg.log"), [], "ffmpeg never ran");
    });

    test("a WebP image, an image with useWebP off, a video and a document are sealed without converting", async () => {
        const webpPath = path.join(work, "already.webp");
        execFileSync("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x180",
            "-frames:v",
            "1",
            webpPath,
        ]);
        const webpMedia = await upload(await readFile(webpPath), {
            mimeType: "image/webp",
            fileName: "a.webp",
        });
        const videoPath = path.join(work, "clip.mp4");
        execFileSync("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x360:duration=1",
            "-pix_fmt",
            "yuv420p",
            videoPath,
        ]);
        const video = await readFile(videoPath);
        const videoMedia = await upload(video, {
            mimeType: "video/mp4",
            fileName: "clip.mp4",
        });
        assert.ok(videoMedia.thumbnail, "videos get a thumbnail at upload");
        const videoThumb = await readImageInfoFromBuffer(
            await bytes(videoMedia.mediaId, "private", "thumb.webp"),
        );
        assert.deepEqual([videoThumb?.width, videoThumb?.height], [100, 50]);
        const doc = Buffer.from("just some text");
        const docMedia = await upload(doc, {
            mimeType: "text/plain",
            fileName: "a.txt",
            access: "private",
        });

        for (const media of [webpMedia, videoMedia, docMedia]) {
            const sealed = await sealIt(media.mediaId);
            assert.equal(sealed.mimeType, media.mimeType);
            assert.equal(sealed.size, media.size);
            // A video goes on to its poster (phase 1, D11).
            assert.equal(
                (await row(media.mediaId))?.processingStatus,
                media === videoMedia ? "processing" : "ready",
            );
        }
        assert.deepEqual(await files(videoMedia.mediaId, "public"), [
            "main.mp4",
            "thumb.webp",
        ]);
        assert.deepEqual(
            await bytes(videoMedia.mediaId, "public", "main.mp4"),
            video,
        );
        assert.deepEqual(await files(docMedia.mediaId, "private"), [
            "main.txt",
        ]);

        await settings({ useWebP: false });
        const original = png();
        const off = await upload(original, { access: "public" });
        const sealed = await sealIt(off.mediaId);
        assert.equal(sealed.mimeType, "image/png");
        assert.deepEqual(
            await bytes(off.mediaId, "public", "main.png"),
            original,
        );
        assert.deepEqual(await files(off.mediaId, "private"), []);
        assert.deepEqual(await logLines("cwebp.log"), []);
    });

    test("concurrent seals of the same media convert it once", async () => {
        await setControl("sleep", "0.5");
        const media = await upload(png(), { access: "public" });
        const results = await Promise.all(
            [1, 2, 3].map(() => sealIt(media.mediaId)),
        );
        assert.equal((await logLines("cwebp.log")).length, 1);
        for (const result of results) assert.deepEqual(result, results[0]);
        assert.equal(results[0].mimeType, "image/webp");
        assert.deepEqual(await files(media.mediaId, "private"), []);
    });

    test("a seal waiting on a live claim fails with a retryable error after SEAL_WAIT_MS", async () => {
        process.env.SEAL_WAIT_MS = "300";
        const media = await upload(png(), { access: "public" });
        await pgTest.db.execute(
            sql`update media set seal_claim = 'other', sealing_until = now() + interval '1 minute' where media_id = ${media.mediaId}`,
        );
        await assert.rejects(sealIt(media.mediaId), {
            message: seal.SEAL_IN_PROGRESS,
        });
        assert.equal((await row(media.mediaId))?.temp, true);
    });

    test("a seal whose claim expired is taken over by the next seal", async () => {
        const media = await upload(png(), { access: "public" });
        // A seal that died: its claim is still there, but expired.
        await pgTest.db.execute(
            sql`update media set seal_claim = 'dead', sealing_until = now() - interval '1 second' where media_id = ${media.mediaId}`,
        );
        const sealed = await sealIt(media.mediaId);
        assert.equal(sealed.mimeType, "image/webp");
        const [state] = (
            await pgTest.db.execute(
                sql`select seal_claim, sealing_until, temp from media where media_id = ${media.mediaId}`,
            )
        ).rows as any[];
        assert.deepEqual(state, {
            seal_claim: null,
            sealing_until: null,
            temp: false,
        });
    });

    test("a seal that runs longer than SEAL_CLAIM_MS keeps its claim by renewing it", async () => {
        process.env.SEAL_CLAIM_MS = "400";
        process.env.SEAL_WAIT_MS = "5000";
        const media = await upload(png(), { access: "public" });
        let release!: () => void;
        const stalled = new Promise<void>((resolve) => (release = resolve));
        let firstToken: string | undefined;
        seal.sealHooks.beforeCommit = async (token) => {
            if (!firstToken) {
                firstToken = token;
                await stalled;
            }
        };
        const first = sealIt(media.mediaId);
        await waitFor(async () => Boolean(firstToken));
        await sleep(1000); // 2.5 × SEAL_CLAIM_MS
        const second = sealIt(media.mediaId);
        await sleep(300);
        release();
        const [a, b] = await Promise.all([first, second]);
        assert.deepEqual(a, b);
        assert.equal(
            (await logLines("cwebp.log")).length,
            1,
            "the second seal waited instead of taking over",
        );
    });

    test("a stalled seal that lost its claim deletes only its own seal/<token>/ files", async () => {
        process.env.SEAL_CLAIM_MS = "60000";
        const media = await upload(png(), { access: "public" });
        let release!: () => void;
        const stalled = new Promise<void>((resolve) => (release = resolve));
        let staleToken: string | undefined;
        seal.sealHooks.beforeSharedWrite = async (token) => {
            if (!staleToken) staleToken = token;
            if (token === staleToken) await stalled;
        };
        const stale = sealIt(media.mediaId);
        await waitFor(async () => Boolean(staleToken));
        // It wrote its own WebP, then stalled past its claim.
        assert.deepEqual(await files(media.mediaId, "private"), [
            "main.png",
            `seal/${staleToken}/main.webp`,
            "thumb.webp",
        ]);
        await pgTest.db.execute(
            sql`update media set sealing_until = now() - interval '1 second' where media_id = ${media.mediaId}`,
        );
        const winner = await sealIt(media.mediaId);
        const committed = await bytes(media.mediaId, "public", "main.webp");
        release();
        // The stale seal finds the media sealed by the winner and returns it.
        assert.deepEqual(await stale, winner);
        assert.deepEqual(await files(media.mediaId, "public"), [
            "main.webp",
            "thumb.webp",
        ]);
        assert.deepEqual(await files(media.mediaId, "private"), []);
        assert.deepEqual(
            await bytes(media.mediaId, "public", "main.webp"),
            committed,
        );
        assert.equal((await logLines("cwebp.log")).length, 2);
    });

    test("a delete while seal converts leaves no files behind", async () => {
        await setControl("sleep", "1");
        process.env.SEAL_CLAIM_MS = "400";
        const media = await upload(png(), { access: "public" });
        const sealing = sealIt(media.mediaId);
        await waitFor(async () => (await logLines("cwebp.log")).length > 0);
        await mediaService.deleteMedia({
            userId,
            appId,
            mediaId: media.mediaId,
        });
        await assert.rejects(sealing, { message: "Media not found" });
        assert.deepEqual(await files(media.mediaId, "private"), []);
        assert.deepEqual(await files(media.mediaId, "public"), []);
    });

    test("a delete just before seal commits leaves no files behind", async () => {
        const media = await upload(png(), { access: "public" });
        seal.sealHooks.beforeCommit = async () => {
            assert.deepEqual(await files(media.mediaId, "public"), [
                "main.webp",
                "thumb.webp",
            ]);
            await mediaService.deleteMedia({
                userId,
                appId,
                mediaId: media.mediaId,
            });
        };
        await assert.rejects(sealIt(media.mediaId), {
            message: "Media not found",
        });
        assert.deepEqual(await files(media.mediaId, "private"), []);
        assert.deepEqual(await files(media.mediaId, "public"), []);
    });

    test("seals beyond WEBP_CONCURRENCY seal without converting after WEBP_QUEUE_WAIT_MS", async () => {
        process.env.WEBP_CONCURRENCY = "1";
        process.env.WEBP_QUEUE_WAIT_MS = "200";
        await setControl("sleep", "1");
        const a = await upload(png(), { access: "public" });
        const b = await upload(png(), { access: "public" });
        const results = await Promise.all([
            sealIt(a.mediaId),
            sealIt(b.mediaId),
        ]);
        assert.deepEqual(results.map((r) => r.mimeType).sort(), [
            "image/png",
            "image/webp",
        ]);
        assert.equal((await logLines("cwebp.log")).length, 1);
        const skipped = results.find((r) => r.mimeType === "image/png")!;
        const record = await row(skipped.mediaId);
        assert.equal(record?.processingStatus, "ready");
        assert.match(record?.processingError ?? "", /No free conversion slot/);
        const alerts = await checks.apiAlertCheck({
            db: pgTest.db,
            logger: { warn: () => undefined },
        })();
        assert.ok(alerts.some((alert) => alert.code === "webp_busy"));
    });

    test("no seal holds a database connection while converting", async () => {
        await setControl("sleep", "1");
        const pool = new pg.Pool({ connectionString: pgTest.url, max: 1 });
        try {
            db.setDb(drizzle(pool, { schema }) as AppDb);
            const media = await upload(png(), { access: "public" });
            const sealing = sealIt(media.mediaId);
            await waitFor(async () => (await logLines("cwebp.log")).length > 0);
            // The only connection must be free while cwebp runs.
            const probe = pool.query("select 1 as ok");
            const result = await Promise.race([
                probe,
                sleep(500).then(() => {
                    throw new Error(
                        "the pool's only connection is held during conversion",
                    );
                }),
            ]);
            assert.equal((result as any).rows[0].ok, 1);
            assert.equal((await sealing).mimeType, "image/webp");
        } finally {
            db.setDb(pgTest.db);
            await pool.end();
        }
    });
});
