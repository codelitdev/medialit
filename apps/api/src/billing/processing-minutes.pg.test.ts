import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import type { CaptureEventInput } from "@codelitdev/observability";
import { createAccount, createApp, createMediaRecord, setDb } from "@/db";
import type { AppDb } from "../db/client.js";
import {
    createTestPostgres,
    testPostgresUrl,
    type TestPostgres,
} from "../jobs/test-postgres.js";
import {
    flushEventsForTests,
    setEventSinkForTests,
} from "../services/events.js";
import {
    minutesFor,
    minutesSummary,
    minutesUsed,
    monthStart,
    releaseMinutes,
    releaseOrphanedMinutes,
    reserveMinutes,
} from "./processing-minutes.js";

const skip = testPostgresUrl
    ? false
    : "set JOBS_TEST_DATABASE_URL to run against real Postgres";

let pgTest: TestPostgres;
let db: AppDb;
const savedEnv = { ...process.env };

before(async () => {
    if (!testPostgresUrl) return;
    pgTest = await createTestPostgres(testPostgresUrl);
    db = pgTest.db;
    setDb(db);
});

after(async () => {
    await pgTest?.drop();
});

afterEach(() => {
    for (const name of ["PROCESSING_MINUTES_FREE", "PROCESSING_MINUTES_PAID"]) {
        if (savedEnv[name] === undefined) delete process.env[name];
        else process.env[name] = savedEnv[name];
    }
});

async function account() {
    const user = await createAccount({
        email: `minutes-${Date.now()}-${Math.random()}@example.com`,
    });
    const app = await createApp({ userId: user.id, name: "minutes" });
    const media = await createMediaRecord({
        fileName: "main.mp4",
        mediaId: `media-${Math.random().toString(36).slice(2)}`,
        userId: user.id,
        appId: app.id,
        originalFileName: "a.mp4",
        mimeType: "video/mp4",
        size: 10,
        thumbnailGenerated: false,
        accessControl: "private",
        temp: false,
        processingStatus: "processing",
    });
    return { userId: user.id, appId: app.id, mediaRowId: media.id };
}

function reserve(
    owner: Awaited<ReturnType<typeof account>>,
    jobId: string,
    minutes: number,
    plan: "basic" | "pro" | "oss" = "basic",
) {
    return reserveMinutes({ ...owner, jobId, kind: "hls", minutes, plan });
}

describe("minutesFor and monthStart", () => {
    test("round a source up to whole minutes, at least one", () => {
        assert.equal(minutesFor(0), 1);
        assert.equal(minutesFor(1), 1);
        assert.equal(minutesFor(60), 1);
        assert.equal(minutesFor(61), 2);
        assert.equal(minutesFor(3599.5), 60);
    });

    test("months start on the first, in UTC", () => {
        assert.equal(
            monthStart(new Date("2026-11-30T23:59:59-05:00")).toISOString(),
            "2026-12-01T00:00:00.000Z",
        );
    });
});

describe("processing minutes (Postgres)", { skip }, () => {
    test("the free plan gets 5 minutes a month, and a retry isn't charged twice", async () => {
        const owner = await account();
        const first = await reserve(owner, "job-a", 3);
        assert.deepEqual(first, { ok: true, charged: 3, used: 3, allowed: 5 });
        const retried = await reserve(owner, "job-a", 3);
        assert.deepEqual(retried, {
            ok: true,
            charged: 3,
            used: 3,
            allowed: 5,
        });
        assert.equal(await minutesUsed(owner.userId), 3);

        const refused = await reserve(owner, "job-b", 3);
        assert.deepEqual(refused, {
            ok: false,
            needed: 3,
            used: 3,
            allowed: 5,
        });
        assert.deepEqual(await minutesSummary(owner.userId, "basic"), {
            used: 3,
            allowed: 5,
        });
    });

    test("PROCESSING_MINUTES_PAID sets the paid allowance, and self-hosted has none", async () => {
        process.env.PROCESSING_MINUTES_PAID = "10";
        const owner = await account();
        assert.equal((await reserve(owner, "paid-1", 8, "pro")).ok, true);
        assert.equal((await reserve(owner, "paid-2", 3, "pro")).ok, false);

        const selfHosted = await account();
        assert.deepEqual(await reserve(selfHosted, "oss-1", 9999, "oss"), {
            ok: true,
            charged: 0,
            used: 0,
            allowed: null,
        });
        // Nothing is recorded for self-hosted installs.
        assert.equal(await minutesUsed(selfHosted.userId), 0);
        assert.deepEqual(await minutesSummary(selfHosted.userId, "oss"), {
            used: 0,
            allowed: null,
        });
    });

    test("two encodes racing for the last minutes can't both take them", async () => {
        const owner = await account();
        assert.equal((await reserve(owner, "race-0", 2)).ok, true);
        const results = await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
                reserve(owner, `race-${i + 1}`, 3),
            ),
        );
        assert.equal(results.filter((r) => r.ok).length, 1);
        assert.equal(await minutesUsed(owner.userId), 5);
    });

    test("minutes from earlier months don't count", async () => {
        const owner = await account();
        await reserveMinutes({
            ...owner,
            jobId: "old-month",
            kind: "hls",
            minutes: 5,
            plan: "basic",
            now: new Date("2020-01-15T00:00:00Z"),
        });
        assert.equal((await reserve(owner, "this-month", 5)).ok, true);
    });

    test("running out sends processing_minutes.exhausted once a month", async () => {
        const sent: CaptureEventInput[] = [];
        const restore = setEventSinkForTests((input) => {
            sent.push(input);
        });
        try {
            const owner = await account();
            await reserve(owner, "fill", 5);
            await reserve(owner, "over-1", 1);
            await reserve(owner, "over-2", 1);
            await flushEventsForTests();
            const exhausted = sent.filter(
                (e) => e.event === "processing_minutes.exhausted",
            );
            assert.equal(exhausted.length, 1);
            assert.equal(exhausted[0].subjectId, owner.userId);
            assert.deepEqual(exhausted[0].properties, {
                plan: "basic",
                minutes_needed: 1,
                minutes_used: 5,
                minutes_allowed: 5,
                app_id: owner.appId,
            });
            // The marker counts no minutes.
            assert.equal(await minutesUsed(owner.userId), 5);
        } finally {
            restore();
        }
    });

    test("a failed encode gets its minutes back", async () => {
        const owner = await account();
        await reserve(owner, "fails", 4);
        assert.equal(await releaseMinutes("fails", "test"), 4);
        assert.equal(await minutesUsed(owner.userId), 0);
        assert.equal(await releaseMinutes("fails", "test"), 0);
    });

    test("the reconciler's release frees minutes only of jobs that didn't succeed", async () => {
        const owner = await account();
        await db.execute(
            sql`INSERT INTO jobs (id, type, payload, media_id, app_id, status, max_attempts)
                VALUES ('kept-job', 'media.hls', '{}', ${owner.mediaRowId}, ${owner.appId}, 'succeeded', 3),
                       ('dead-job', 'media.hls', '{}', ${owner.mediaRowId}, ${owner.appId}, 'failed', 3)`,
        );
        await reserve(owner, "kept-job", 1, "pro");
        await reserve(owner, "dead-job", 2, "pro");
        await reserve(owner, "gone-job", 3, "pro");
        assert.equal(
            await releaseOrphanedMinutes(db, owner.mediaRowId, "hls"),
            5,
        );
        assert.equal(await minutesUsed(owner.userId), 1);
    });
});
