import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import {
    completeUploadingMediaRecord,
    createUploadingMediaRecord,
    getMediaRecord,
    listDerivatives,
    setDb,
    totalMediaSize,
    upsertDerivative,
} from "@/db";
import {
    createOwner as owner,
    createProcessingMedia as processingMedia,
    sealForTests,
} from "../db/test-records.js";
import type { AppDb } from "../db/client.js";
import type { JobRow } from "../jobs/queue.js";
import { permanentError, retryableError } from "../jobs/errors.js";
import {
    createTestPostgres,
    testPostgresUrl,
    type TestPostgres,
} from "../jobs/test-postgres.js";
import {
    MEDIA_PUBLISH_JOB,
    afterSealCommit,
    deleteMediaFolders,
    derivativeJob,
    derivativeObjectKey,
    derivativesResponse,
    finishDerivative,
    mediaFolder,
    onProcessingSettled,
    publishDerivatives,
    reconcileProcessing,
    type ProcessingSettledEvent,
} from "./derivatives.js";
import { cloudBucket, cloudPublicBucket } from "../config/constants.js";
import { headObject, listKeys, putObject } from "../services/s3.js";
import type { CaptureEventInput } from "@codelitdev/observability";
import {
    flushEventsForTests,
    setEventSinkForTests,
} from "../services/events.js";

const skip = testPostgresUrl
    ? false
    : "set JOBS_TEST_DATABASE_URL to run against real Postgres";

let pgTest: TestPostgres;
let db: AppDb;

before(async () => {
    if (!testPostgresUrl) return;
    pgTest = await createTestPostgres(testPostgresUrl);
    db = pgTest.db;
    setDb(db);
});

after(async () => {
    await pgTest?.drop();
});

async function mediaStatus(id: string) {
    const result = await db.execute(
        sql`SELECT processing_status AS status, processing_error AS error
            FROM media WHERE id = ${id}`,
    );
    return result.rows[0] as { status: string; error: string | null };
}

async function jobsOf(mediaRowId: string, type: string) {
    const result = await db.execute(
        sql`SELECT id FROM jobs WHERE media_id = ${mediaRowId} AND type = ${type}`,
    );
    return result.rows;
}

function context(
    mediaRowId: string,
    attempts = 1,
    maxAttempts = 3,
): Parameters<ReturnType<typeof derivativeJob>["handler"]>[1] {
    return {
        job: { mediaId: mediaRowId, attempts, maxAttempts } as JobRow,
        signal: new AbortController().signal,
        workerId: "test",
    };
}

describe("derivatives (Postgres)", { skip }, () => {
    test("an upload records its thumbnail as a ready derivative, outside the storage total", async () => {
        const { user, app } = await owner();
        const mediaId = `media-${Math.random().toString(36).slice(2)}`;
        await createUploadingMediaRecord({
            mediaId,
            userId: user.id,
            appId: app.id,
            fileName: "main.png",
            originalFileName: "a.png",
            mimeType: "image/png",
            size: 100,
        });
        const pending = await getMediaRecord({
            userId: user.id,
            appId: app.id,
            mediaId,
        });
        // Not yet visible: uploads are hidden until they finish.
        assert.equal(pending, null);
        assert.equal(
            await completeUploadingMediaRecord({
                mediaId,
                fileName: "main.png",
                mimeType: "image/png",
                size: 100,
                thumbnailGenerated: true,
                thumbnailSize: 7,
                accessControl: "private",
            }),
            true,
        );
        const record = (await getMediaRecord({
            userId: user.id,
            appId: app.id,
            mediaId,
        }))!;
        assert.equal(record.processingStatus, "pending");
        const [thumb] = await listDerivatives(db, record.id);
        assert.equal(thumb.name, "thumbnail");
        assert.equal(thumb.status, "ready");
        assert.equal(thumb.bucket, "private");
        assert.equal(thumb.key, "thumb.webp");
        assert.equal(await totalMediaSize({ userId: user.id }), 100);

        await sealForTests({
            userId: user.id,
            appId: app.id,
            mediaId,
            inTransaction: afterSealCommit,
        });
        const sealed = (await getMediaRecord({
            userId: user.id,
            appId: app.id,
            mediaId,
        }))!;
        assert.equal(sealed.temp, false);
        assert.equal(sealed.processingStatus, "ready");
        const [published] = await listDerivatives(db, record.id);
        assert.equal(published.bucket, "public");
        // Seal copied the thumbnail itself; nothing is left to publish.
        assert.equal((await jobsOf(record.id, MEDIA_PUBLISH_JOB)).length, 0);
    });

    test("seal queues media.publish once for ready derivatives that must be public", async () => {
        const { media } = await processingMedia({ access: "public" });
        await db.execute(
            sql`UPDATE media SET temp = true WHERE id = ${media.id}`,
        );
        await upsertDerivative(db, {
            mediaRowId: media.id,
            name: "hls",
            status: "ready",
            key: "hls/",
            size: 5,
        });
        await sealForTests({
            userId: media.userId,
            appId: media.appId,
            mediaId: media.mediaId,
            inTransaction: afterSealCommit,
        });
        await db.transaction((tx) => afterSealCommit(tx, media.id));
        assert.equal((await jobsOf(media.id, MEDIA_PUBLISH_JOB)).length, 1);

        // Private media publishes only thumbnails.
        const other = await processingMedia({ access: "private" });
        await upsertDerivative(db, {
            mediaRowId: other.media.id,
            name: "mp4",
            status: "ready",
            key: "mp4/main.mp4",
            size: 5,
        });
        await db.transaction((tx) => afterSealCommit(tx, other.media.id));
        assert.equal(
            (await jobsOf(other.media.id, MEDIA_PUBLISH_JOB)).length,
            0,
        );
    });

    test("a derivative job makes the media ready, settles once and queues publishing", async () => {
        const { media } = await processingMedia({ access: "public" });
        await upsertDerivative(db, {
            mediaRowId: media.id,
            name: "still",
            status: "queued",
        });
        const events: ProcessingSettledEvent[] = [];
        const stop = onProcessingSettled(async (_tx, event) => {
            events.push(event);
        });
        const sent: CaptureEventInput[] = [];
        const restoreSink = setEventSinkForTests((input) => {
            sent.push(input);
        });
        try {
            const job = derivativeJob({
                type: "test.still",
                name: "still",
                class: "io",
                maxAttempts: 3,
                produce: async ({ privateFolder }) => {
                    assert.ok(privateFolder.endsWith(`/${media.mediaId}/`));
                    return {
                        key: "still.webp",
                        mimeType: "image/webp",
                        size: 3,
                    };
                },
            });
            await job.handler({ derivative: "still" }, context(media.id));
            await flushEventsForTests();
        } finally {
            stop();
            restoreSink();
        }
        // Sent once, after the commit, under the account.
        assert.equal(sent.length, 1);
        assert.equal(sent[0].event, "media.processing.settled");
        assert.equal(sent[0].subjectId, media.userId);
        assert.deepEqual(sent[0].properties, {
            media_id: media.mediaId,
            media_kind: "video",
            status: "ready",
            derivatives: ["still"],
            failed_derivatives: [],
            app_id: media.appId,
        });
        const [still] = await listDerivatives(db, media.id);
        assert.equal(still.status, "ready");
        assert.equal(still.size, 3);
        assert.deepEqual(await mediaStatus(media.id), {
            status: "ready",
            error: null,
        });
        assert.equal(events.length, 1);
        assert.equal(events[0].status, "ready");
        assert.equal(events[0].media.mediaId, media.mediaId);
        assert.equal((await jobsOf(media.id, MEDIA_PUBLISH_JOB)).length, 1);
        assert.equal(await totalMediaSize({ userId: media.userId }), 13);
    });

    test("a derivative that finishes while publishing runs gets its own publish job", async () => {
        const { media } = await processingMedia({ access: "public" });
        await upsertDerivative(db, {
            mediaRowId: media.id,
            name: "still",
            status: "queued",
        });
        // A publish job that already read its rows is running.
        await db.execute(
            sql`INSERT INTO jobs (id, type, payload, media_id, status, max_attempts, attempts, locked_by, locked_until)
                VALUES (${`running-${media.id}`}, ${MEDIA_PUBLISH_JOB}, '{}'::jsonb, ${media.id},
                    'running', 5, 1, 'worker', now() + interval '1 minute')`,
        );
        await finishDerivative({
            mediaRowId: media.id,
            name: "still",
            result: {
                status: "ready",
                output: { key: "still.webp", size: 1 },
            },
        });
        const queued = await db.execute(
            sql`SELECT id FROM jobs WHERE media_id = ${media.id}
                AND type = ${MEDIA_PUBLISH_JOB} AND status = 'queued'`,
        );
        assert.equal(queued.rows.length, 1);
    });

    test("media settles only after its last derivative finishes", async () => {
        const { media } = await processingMedia();
        for (const name of ["still", "mp4"]) {
            await upsertDerivative(db, {
                mediaRowId: media.id,
                name,
                status: "queued",
            });
        }
        await finishDerivative({
            mediaRowId: media.id,
            name: "still",
            result: {
                status: "ready",
                output: { key: "still.webp", size: 1 },
            },
        });
        assert.equal((await mediaStatus(media.id)).status, "processing");
        await finishDerivative({
            mediaRowId: media.id,
            name: "mp4",
            result: { status: "failed", error: "ffmpeg exited with 1" },
        });
        assert.deepEqual(await mediaStatus(media.id), {
            status: "failed",
            error: "mp4: ffmpeg exited with 1",
        });
    });

    test("a failed job settles on its last attempt, not before", async () => {
        const { media } = await processingMedia();
        await upsertDerivative(db, {
            mediaRowId: media.id,
            name: "mp4",
            status: "queued",
        });
        const job = derivativeJob({
            type: "test.mp4",
            name: "mp4",
            class: "cpu",
            maxAttempts: 2,
            produce: async () => {
                throw retryableError("encoder crashed");
            },
        });
        await assert.rejects(
            job.handler({ derivative: "mp4" }, context(media.id, 1, 2)),
        );
        assert.equal((await mediaStatus(media.id)).status, "processing");
        await assert.rejects(
            job.handler({ derivative: "mp4" }, context(media.id, 2, 2)),
        );
        assert.deepEqual(await mediaStatus(media.id), {
            status: "failed",
            error: "mp4: encoder crashed",
        });

        // A permanent error settles at once.
        const other = await processingMedia();
        const bad = derivativeJob({
            type: "test.bad",
            name: "still",
            class: "cpu",
            maxAttempts: 3,
            produce: async () => {
                throw permanentError("not a video");
            },
        });
        await assert.rejects(
            bad.handler({ derivative: "still" }, context(other.media.id)),
        );
        assert.equal((await mediaStatus(other.media.id)).status, "failed");
    });

    test("a derivative over the storage limit fails with not_enough_storage", async () => {
        const { media } = await processingMedia({ size: 1 });
        await upsertDerivative(db, {
            mediaRowId: media.id,
            name: "mp4",
            status: "queued",
        });
        const outcome = await finishDerivative({
            mediaRowId: media.id,
            name: "mp4",
            result: {
                status: "ready",
                output: { key: "mp4/main.mp4", size: Number.MAX_SAFE_INTEGER },
            },
        });
        assert.equal(outcome, "not_enough_storage");
        const [mp4] = await listDerivatives(db, media.id);
        assert.equal(mp4.status, "failed");
        assert.equal(mp4.error, "not_enough_storage");
        assert.equal((await mediaStatus(media.id)).status, "failed");
        assert.equal(await totalMediaSize({ userId: media.userId }), 1);
    });

    test("captions keep their seal params, add what the job learned, and list their files", async () => {
        const { media } = await processingMedia({ queued: "thumbnail" });
        await upsertDerivative(db, {
            mediaRowId: media.id,
            name: "captions",
            status: "queued",
            params: { source: "video", durationSeconds: 6 },
        });
        await finishDerivative({
            mediaRowId: media.id,
            name: "captions",
            result: {
                status: "ready",
                output: {
                    key: "captions/",
                    size: 300,
                    params: { language: "en", model: "fake" },
                },
            },
        });
        const rows = await listDerivatives(db, media.id);
        const captions = rows.find((d) => d.name === "captions")!;
        assert.deepEqual(captions.params, {
            source: "video",
            durationSeconds: 6,
            language: "en",
            model: "fake",
        });
        // A background derivative: the media still waits for its poster.
        assert.equal((await mediaStatus(media.id)).status, "processing");
        const response = await derivativesResponse(media.mediaId, rows);
        const item = response.captions;
        assert.equal(item.status, "ready");
        assert.equal(item.language, "en");
        assert.equal(item.size, 300);
        assert.match(item.files!.vtt, /captions\/captions\.vtt/);
        assert.match(item.files!.text, /captions\/transcript\.txt/);
        assert.match(item.files!.json, /captions\/transcript\.json/);
        assert.equal(item.url, item.files!.vtt);
    });

    test("a job finishing after its media was deleted records nothing", async () => {
        const { media } = await processingMedia();
        await db.execute(sql`DELETE FROM media WHERE id = ${media.id}`);
        const outcome = await finishDerivative({
            mediaRowId: media.id,
            name: "mp4",
            result: { status: "ready", output: { key: "mp4/a", size: 1 } },
        });
        assert.equal(outcome, "media_gone");
    });

    test("the reconciler fails derivatives whose job is gone and settles their media", async () => {
        const { media } = await processingMedia();
        await upsertDerivative(db, {
            mediaRowId: media.id,
            name: "hls",
            status: "processing",
        });
        // Fresh rows are left alone; the job may still be starting.
        assert.equal((await reconcileProcessing()).failed, 0);
        await db.execute(
            sql`UPDATE derivatives SET updated_at = now() - interval '1 hour'
                WHERE media_id = ${media.id}`,
        );
        assert.ok((await reconcileProcessing()).failed >= 1);
        assert.deepEqual(await mediaStatus(media.id), {
            status: "failed",
            error: "hls: processing stopped",
        });
    });
});

// Needs the stack's MinIO too: `bun run test:integration:stack` exports
// CLOUD_ENDPOINT and the bucket names before it runs these tests.
const skipStorage =
    skip ||
    (process.env.CLOUD_ENDPOINT && process.env.CLOUD_BUCKET_NAME
        ? false
        : "set CLOUD_ENDPOINT and the bucket names to run against MinIO");

describe(
    "derivatives in storage (Postgres and MinIO)",
    { skip: skipStorage },
    () => {
        const exists = async (key: string, bucket: string) => {
            try {
                await headObject({ Key: key, Bucket: bucket });
                return true;
            } catch {
                return false;
            }
        };
        const put = (key: string) =>
            putObject({
                Key: key,
                Body: Buffer.from("still"),
                ContentType: "image/webp",
                Bucket: cloudBucket,
            });

        test("a derivative that finishes after a public seal is published", async () => {
            const { media } = await processingMedia({ access: "public" });
            const privateKey = derivativeObjectKey(
                media.mediaId,
                "private",
                "still.webp",
            );
            const publicKey = derivativeObjectKey(
                media.mediaId,
                "public",
                "still.webp",
            );
            const job = derivativeJob({
                type: "test.poster_storage",
                name: "still",
                class: "io",
                maxAttempts: 3,
                produce: async () => {
                    await put(privateKey);
                    return {
                        key: "still.webp",
                        mimeType: "image/webp",
                        size: 6,
                    };
                },
            });
            await job.handler({ derivative: "still" }, context(media.id));
            assert.equal((await jobsOf(media.id, MEDIA_PUBLISH_JOB)).length, 1);

            assert.deepEqual(await publishDerivatives(media.id), {
                published: 1,
            });
            assert.equal(await exists(publicKey, cloudPublicBucket), true);
            assert.equal(await exists(privateKey, cloudBucket), false);
            const [still] = await listDerivatives(db, media.id);
            assert.equal(still.bucket, "public");
            // Idempotent: nothing is left to publish.
            assert.deepEqual(await publishDerivatives(media.id), {
                published: 0,
            });

            await deleteMediaFolders(media.mediaId);
            assert.equal(await exists(publicKey, cloudPublicBucket), false);
        });

        test("a derivative that finished before seal is published when seal commits", async () => {
            const { media } = await processingMedia({ access: "public" });
            await db.execute(
                sql`UPDATE media SET temp = true WHERE id = ${media.id}`,
            );
            const privateKey = derivativeObjectKey(
                media.mediaId,
                "private",
                "still.webp",
            );
            await put(privateKey);
            await upsertDerivative(db, {
                mediaRowId: media.id,
                name: "still",
                status: "ready",
                key: "still.webp",
                mimeType: "image/webp",
                size: 6,
            });
            await sealForTests({
                userId: media.userId,
                appId: media.appId,
                mediaId: media.mediaId,
                inTransaction: afterSealCommit,
            });
            assert.equal((await jobsOf(media.id, MEDIA_PUBLISH_JOB)).length, 1);
            assert.deepEqual(await publishDerivatives(media.id), {
                published: 1,
            });
            assert.equal(
                await exists(
                    derivativeObjectKey(media.mediaId, "public", "still.webp"),
                    cloudPublicBucket,
                ),
                true,
            );
            await deleteMediaFolders(media.mediaId);
        });

        test("deleting media while its job runs leaves nothing in either bucket", async () => {
            const { media } = await processingMedia({ access: "public" });
            const privateKey = derivativeObjectKey(
                media.mediaId,
                "private",
                "mp4/main.mp4",
            );
            const job = derivativeJob({
                type: "test.mp4_storage",
                name: "mp4",
                class: "cpu",
                maxAttempts: 3,
                produce: async () => {
                    await put(privateKey);
                    // The media is deleted while the job is still running.
                    await deleteMediaFolders(media.mediaId);
                    await db.execute(
                        sql`DELETE FROM media WHERE id = ${media.id}`,
                    );
                    return {
                        key: "mp4/main.mp4",
                        mimeType: "video/mp4",
                        size: 6,
                    };
                },
            });
            await job.handler({ derivative: "mp4" }, context(media.id));
            assert.deepEqual(
                await listKeys(mediaFolder(media.mediaId, "i"), cloudBucket),
                [],
            );
            assert.deepEqual(
                await listKeys(
                    mediaFolder(media.mediaId, "p"),
                    cloudPublicBucket,
                ),
                [],
            );
        });
    },
);
