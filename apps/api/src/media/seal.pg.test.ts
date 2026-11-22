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
const skip = !testPostgresUrl
    ? "set JOBS_TEST_DATABASE_URL to run against real Postgres"
    : !process.env.CLOUD_ENDPOINT
      ? "set the CLOUD_* settings of a test MinIO"
      : !realCwebp || !realFfmpeg
        ? "cwebp and ffmpeg must be installed"
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
        `#!/bin/sh\necho "$*" >> "${work}/ffmpeg.log"\nexec "${realFfmpeg}" "$@"\n`,
    );
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
    for (const name of ["sleep", "fail"]) await setControl(name, null);
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
}) {
    await db.upsertMediaSettings({
        userId,
        appId,
        useWebP: overrides.useWebP ?? true,
        webpOutputQuality: 80,
        thumbnailWidth: overrides.thumbnailWidth ?? 100,
        thumbnailHeight: overrides.thumbnailHeight ?? 50,
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
            assert.equal((await row(media.mediaId))?.processingStatus, "ready");
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
