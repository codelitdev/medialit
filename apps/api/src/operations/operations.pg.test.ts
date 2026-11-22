import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { enqueue, getJob, recordWorker } from "../jobs/queue.js";
import { pgListener } from "../jobs/listen.js";
import { runJobsCli } from "../jobs/operator-cli.js";
import { jobTelemetryHooks } from "../jobs/telemetry.js";
import {
    createTestPostgres,
    testPostgresUrl,
    type TestPostgres,
} from "../jobs/test-postgres.js";
import { claimPage, pageAlert, type Alert, type PageDeps } from "./alerts.js";
import {
    ALERTS_LOCK,
    apiAlertCheck,
    collectWorkerAlerts,
    recordWebpBusy,
    resetWebpBusyForTests,
} from "./checks.js";

const skip = testPostgresUrl
    ? false
    : "set JOBS_TEST_DATABASE_URL to run against real Postgres";

let pgTest: TestPostgres;
let db: AppDb;

before(async () => {
    if (!testPostgresUrl) return;
    pgTest = await createTestPostgres(testPostgresUrl);
    db = pgTest.db;
});

after(async () => {
    await pgTest?.drop();
});

type Recorded = {
    errors: Array<[Record<string, unknown>, string]>;
    warnings: Array<[Record<string, unknown>, string]>;
    exceptions: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    emails: Array<{ to: string[]; subject: string; text: string }>;
};

function fakeDeps(recipients = ["ops@example.com"]) {
    const recorded: Recorded = {
        errors: [],
        warnings: [],
        exceptions: [],
        events: [],
        emails: [],
    };
    const deps: PageDeps = {
        db,
        logger: {
            error: (context, message) =>
                recorded.errors.push([context, message]),
            warn: (context, message) =>
                recorded.warnings.push([context, message]),
        },
        captureException: (input) => recorded.exceptions.push(input),
        captureEvent: (input) => recorded.events.push(input),
        email: async (to, subject, text) => {
            recorded.emails.push({ to, subject, text });
        },
        recipients: () => recipients,
    };
    return { deps, recorded };
}

const queueLag: Alert = {
    code: "jobs_queue_lag",
    message: "A queued job has waited too long.",
    details: { age_ms: 700_000 },
};

describe("paging (Postgres)", { skip }, () => {
    beforeEach(async () => {
        await db.execute(sql`DELETE FROM operator_alerts`);
    });

    test("a page logs, captures, and emails the operators", async () => {
        const { deps, recorded } = fakeDeps();
        assert.equal(await pageAlert(queueLag, deps), true);
        assert.deepEqual(recorded.errors, [
            [
                { alert_code: "jobs_queue_lag", age_ms: 700_000 },
                "A queued job has waited too long.",
            ],
        ]);
        assert.equal(recorded.events.length, 1);
        assert.equal(recorded.events[0].event, "operations.page");
        assert.equal(recorded.exceptions.length, 1);
        assert.equal(recorded.exceptions[0].source, "operations.alerts");
        assert.equal(recorded.exceptions[0].severity, "critical");
        assert.equal(recorded.emails.length, 1);
        assert.deepEqual(recorded.emails[0].to, ["ops@example.com"]);
        assert.equal(recorded.emails[0].subject, "[MediaLit] jobs_queue_lag");
    });

    test("each code pages at most once in 30 minutes, across processes", async () => {
        const first = fakeDeps();
        const second = fakeDeps();
        assert.equal(await pageAlert(queueLag, first.deps), true);
        // Another API replica or worker, with its own memory.
        assert.equal(await pageAlert(queueLag, second.deps), false);
        assert.equal(await pageAlert(queueLag, first.deps), false);
        assert.equal(second.recorded.errors.length, 0);
        assert.equal(first.recorded.emails.length, 1);

        // Another code is not held back.
        assert.equal(
            await pageAlert(
                { ...queueLag, code: "jobs_failure_spike" },
                second.deps,
            ),
            true,
        );

        await db.execute(
            sql`UPDATE operator_alerts SET last_paged_at = now() - interval '31 minutes'
                WHERE code = 'jobs_queue_lag'`,
        );
        assert.equal(await pageAlert(queueLag, second.deps), true);
    });

    test("only one of many concurrent pages goes out", async () => {
        const results = await Promise.all(
            Array.from({ length: 8 }, () => claimPage(db, "jobs_no_worker")),
        );
        assert.equal(results.filter(Boolean).length, 1);
    });

    test("a failed email doesn't stop the page", async () => {
        const { deps, recorded } = fakeDeps();
        deps.email = async () => {
            throw new Error("smtp down");
        };
        assert.equal(await pageAlert(queueLag, deps), true);
        assert.equal(recorded.exceptions.length, 1);
        assert.equal(recorded.warnings[0][1], "Operator email failed");
    });
});

describe("the alerts lock (Postgres)", { skip }, () => {
    test("only one worker holds it, and another takes it when that one stops", async () => {
        const first = pgListener(pgTest.url, { onError: () => undefined });
        const second = pgListener(pgTest.url, { onError: () => undefined });
        const closeFirst = await first.listen(() => undefined);
        const closeSecond = await second.listen(() => undefined);
        try {
            assert.equal(await first.holdsLock(ALERTS_LOCK), true);
            assert.equal(await second.holdsLock(ALERTS_LOCK), false);
            // Asking again doesn't stack the lock.
            assert.equal(await first.holdsLock(ALERTS_LOCK), true);
            await closeFirst();
            assert.equal(await second.holdsLock(ALERTS_LOCK), true);
        } finally {
            await closeFirst();
            await closeSecond();
        }
    });

    test("a listener that isn't connected holds nothing", async () => {
        const listener = pgListener(pgTest.url, { onError: () => undefined });
        assert.equal(await listener.holdsLock(ALERTS_LOCK), false);
    });
});

describe("worker checks (Postgres)", { skip }, () => {
    beforeEach(async () => {
        await db.execute(sql`DELETE FROM jobs`);
    });

    test("nothing to report on a healthy queue", async () => {
        await enqueue(db, { type: "test.fresh", payload: {}, maxAttempts: 1 });
        assert.deepEqual(await collectWorkerAlerts(db), []);
    });

    test("a job queued for more than 10 minutes pages jobs_queue_lag", async () => {
        const id = (await enqueue(db, {
            type: "test.stuck",
            payload: {},
            maxAttempts: 1,
        }))!;
        await db.execute(
            sql`UPDATE jobs SET run_at = now() - interval '11 minutes' WHERE id = ${id}`,
        );
        // A job scheduled for later is not late.
        await enqueue(db, {
            type: "test.later",
            payload: {},
            maxAttempts: 1,
            delayMs: 60 * 60 * 1000,
        });
        const alerts = await collectWorkerAlerts(db);
        assert.deepEqual(
            alerts.map((alert) => alert.code),
            ["jobs_queue_lag"],
        );
        assert.ok(Number(alerts[0].details.age_ms) > 10 * 60 * 1000);
    });

    test("a video job pages video_queue_lag after 6 hours, not jobs_queue_lag after 10 minutes", async () => {
        await db.execute(sql`DELETE FROM jobs WHERE status = 'queued'`);
        const id = (await enqueue(db, {
            type: "test.encode",
            payload: {},
            maxAttempts: 1,
        }))!;
        const options = { videoJobTypes: ["test.encode"] };
        await db.execute(
            sql`UPDATE jobs SET run_at = now() - interval '2 hours' WHERE id = ${id}`,
        );
        assert.deepEqual(await collectWorkerAlerts(db, options), []);
        await db.execute(
            sql`UPDATE jobs SET run_at = now() - interval '7 hours' WHERE id = ${id}`,
        );
        const alerts = await collectWorkerAlerts(db, options);
        assert.deepEqual(
            alerts.map((alert) => alert.code),
            ["video_queue_lag"],
        );
        await db.execute(sql`DELETE FROM jobs WHERE id = ${id}`);
    });

    test("more than 10 failures in 10 minutes page jobs_failure_spike, webhooks aside", async () => {
        const failJobs = async (type: string, count: number, ago: string) => {
            for (let index = 0; index < count; index++) {
                const id = (await enqueue(db, {
                    type,
                    payload: {},
                    maxAttempts: 1,
                }))!;
                await db.execute(
                    sql`UPDATE jobs SET status = 'failed', finished_at = now() - ${ago}::interval WHERE id = ${id}`,
                );
            }
        };
        await failJobs("test.broken", 10, "1 minute");
        await failJobs("webhook.deliver", 5, "1 minute");
        await failJobs("test.old", 5, "20 minutes");
        assert.deepEqual(await collectWorkerAlerts(db), []);

        await failJobs("test.broken", 1, "1 minute");
        const alerts = await collectWorkerAlerts(db);
        assert.deepEqual(
            alerts.map((alert) => alert.code),
            ["jobs_failure_spike"],
        );
        assert.equal(alerts[0].details.count, 11);
    });
});

describe("API checks (Postgres)", { skip }, () => {
    beforeEach(async () => {
        await db.execute(sql`DELETE FROM workers`);
        resetWebpBusyForTests();
    });

    test("no worker for 5 minutes pages jobs_no_worker, and warns hourly", async () => {
        let now = 1_000_000;
        const warnings: string[] = [];
        const check = apiAlertCheck({
            db,
            logger: { warn: (_context, message) => warnings.push(message) },
            now: () => now,
        });

        // Just started: warns, but gives a worker time to show up.
        assert.deepEqual(await check(), []);
        assert.equal(warnings.length, 1);

        now += 5 * 60 * 1000;
        const alerts = await check();
        assert.deepEqual(
            alerts.map((alert) => alert.code),
            ["jobs_no_worker"],
        );
        assert.equal(alerts[0].details.reason, "cpu,io,video");
        assert.equal(warnings.length, 1, "the warning waits an hour");

        await recordWorker(db, { id: "io-worker", classes: ["io"] });
        const partial = await check();
        assert.deepEqual(
            partial.map((alert) => alert.details.reason),
            ["cpu,video"],
        );
        assert.match(partial[0].message, /posters are not made/);
        assert.match(partial[0].message, /Videos are not encoded/);

        await recordWorker(db, { id: "cpu-worker", classes: ["cpu"] });
        const videoOnly = await check();
        assert.deepEqual(
            videoOnly.map((alert) => alert.details.reason),
            ["video"],
        );
        assert.equal(
            videoOnly[0].message,
            "No worker has run video jobs for 5 minutes. Videos are not encoded.",
        );

        await recordWorker(db, { id: "video-worker", classes: ["video"] });
        assert.deepEqual(await check(), []);
    });

    test("a stopped worker counts as live for 5 more minutes", async () => {
        await recordWorker(db, {
            id: "stopped",
            classes: ["cpu", "io", "video"],
        });
        await db.execute(
            sql`UPDATE workers SET last_seen_at = now() - interval '4 minutes'`,
        );
        let now = 0;
        const check = apiAlertCheck({
            db,
            logger: { warn: () => undefined },
            now: () => now,
        });
        now += 10 * 60 * 1000;
        assert.deepEqual(await check(), []);
        await db.execute(
            sql`UPDATE workers SET last_seen_at = now() - interval '6 minutes'`,
        );
        assert.equal((await check()).length, 1);
    });

    test("WebP skipped for lack of a slot pages webp_busy", async () => {
        await recordWorker(db, {
            id: "worker",
            classes: ["cpu", "io", "video"],
        });
        const check = apiAlertCheck({ db, logger: { warn: () => undefined } });
        assert.deepEqual(await check(), []);
        recordWebpBusy();
        recordWebpBusy();
        const alerts = await check();
        assert.deepEqual(
            alerts.map((alert) => [alert.code, alert.details.count]),
            [["webp_busy", 2]],
        );
        resetWebpBusyForTests();
        recordWebpBusy(Date.now() - 11 * 60 * 1000);
        assert.deepEqual(await check(), []);
    });
});

describe("job exceptions", () => {
    function capture() {
        const captured: Array<Record<string, unknown>> = [];
        return {
            captured,
            hooks: jobTelemetryHooks((input) => captured.push(input)),
        };
    }
    const job = {
        id: "job-1",
        type: "media.publish",
        payload: {},
        mediaId: "media-1",
        appId: "app-1",
        status: "failed" as const,
        priority: 100,
        runAt: new Date(),
        attempts: 5,
        maxAttempts: 5,
        lockedBy: null,
        lockedUntil: null,
        lastError: null,
        result: null,
        dedupeKey: null,
        createdAt: new Date(),
        startedAt: null,
        finishedAt: null,
    };

    test("a job that fails for good raises one exception named for its type", () => {
        const { captured, hooks } = capture();
        hooks.onJobFailed!({ job, reason: "bad_input", error: "bad file" });
        assert.equal(captured.length, 1);
        assert.equal(captured[0].source, "worker.media.publish.failed");
        assert.equal(captured[0].severity, "error");
        assert.equal(captured[0].subjectId, "app-1");
        assert.deepEqual(captured[0].context, {
            job_id: "job-1",
            job_type: "media.publish",
            attempts_made: 5,
            failed_reason: "bad_input",
            media_id: "media-1",
            app_id: "app-1",
        });
    });

    test("storage, database and internal failures are critical", () => {
        const { captured, hooks } = capture();
        for (const reason of ["storage", "db", "internal"] as const) {
            hooks.onJobFailed!({ job, reason, error: "x" });
        }
        assert.deepEqual(
            captured.map((entry) => entry.severity),
            ["critical", "critical", "critical"],
        );
    });

    test("webhook deliveries raise none", () => {
        const { captured, hooks } = capture();
        hooks.onJobFailed!({
            job: { ...job, type: "webhook.deliver" },
            reason: "http_status",
            error: "500",
        });
        assert.equal(captured.length, 0);
    });

    test("reaped jobs raise one warning per type per sweep", () => {
        const { captured, hooks } = capture();
        const reaped = (id: string, type: string) => ({
            id,
            type,
            mediaId: null,
            appId: null,
            attempts: 1,
            lockedBy: "gone",
            status: "queued" as const,
        });
        hooks.onReaped!([
            reaped("a", "media.publish"),
            reaped("b", "media.publish"),
            reaped("c", "jobs.prune"),
        ]);
        assert.deepEqual(
            captured.map((entry) => [
                entry.source,
                entry.severity,
                (entry.context as Record<string, unknown>).count,
            ]),
            [
                ["worker.media.publish.reaped", "warning", 2],
                ["worker.jobs.prune.reaped", "warning", 1],
            ],
        );
    });

    test("runner errors raise worker.error", () => {
        const { captured, hooks } = capture();
        hooks.onRunnerError!(new Error("connection lost"), "claim");
        assert.equal(captured[0].source, "worker.error");
        assert.equal(captured[0].subjectId, "system");
    });
});

describe("the jobs command (Postgres)", { skip }, () => {
    async function run(...argv: string[]) {
        const out: string[] = [];
        const err: string[] = [];
        const code = await runJobsCli(argv, {
            db,
            out: (line) => out.push(line),
            err: (line) => err.push(line),
        });
        return { code, out: out.join("\n"), err: err.join("\n") };
    }

    async function failedJob(type: string, dedupeKey?: string) {
        const id = (await enqueue(db, {
            type,
            payload: { n: 1 },
            maxAttempts: 3,
            dedupeKey,
        }))!;
        await db.execute(
            sql`UPDATE jobs SET status = 'failed', attempts = 3, finished_at = now(),
                last_error = 'storage: bucket unreachable' WHERE id = ${id}`,
        );
        return id;
    }

    beforeEach(async () => {
        await db.execute(sql`DELETE FROM jobs`);
        await db.execute(sql`DELETE FROM workers`);
    });

    test("stats counts by type and status", async () => {
        await enqueue(db, { type: "test.a", payload: {}, maxAttempts: 1 });
        await failedJob("test.a");
        await recordWorker(db, { id: "w1", classes: ["io"] });
        const { code, out } = await run("stats");
        assert.equal(code, 0);
        assert.match(
            out,
            /TYPE\s+QUEUED\s+RUNNING\s+SUCCEEDED\s+FAILED\s+CANCELLED/,
        );
        assert.match(out, /test\.a\s+1\s+0\s+0\s+1\s+0/);
        assert.match(out, /Failed in the last hour: 1/);
        assert.match(out, /Live workers: 1/);
    });

    test("list filters, and shows the reason and error", async () => {
        const failed = await failedJob("test.b");
        await enqueue(db, { type: "test.b", payload: {}, maxAttempts: 1 });
        const { out } = await run(
            "list",
            "--status",
            "failed",
            "--since",
            "1h",
        );
        assert.match(out, new RegExp(failed));
        assert.match(out, /storage: bucket unreachable/);
        assert.equal(out.split("\n").length, 2);
        assert.match((await run("list", "--type", "test.none")).out, /No jobs/);
    });

    test("show prints the row; media lists a media item's jobs", async () => {
        const id = await failedJob("test.c");
        const shown = await run("show", id);
        assert.equal(JSON.parse(shown.out).id, id);
        assert.equal((await run("show", "missing")).code, 1);
        assert.match((await run("media", "no-such-media")).out, /No jobs/);
    });

    test("retry queues a failed job again with attempts reset", async () => {
        const id = await failedJob("test.d");
        assert.equal((await run("retry", id)).code, 0);
        const job = (await getJob(db, id))!;
        assert.equal(job.status, "queued");
        assert.equal(job.attempts, 0);
        assert.equal(job.finishedAt, null);
        const again = await run("retry", id);
        assert.equal(again.code, 1);
        assert.match(again.err, /only failed and cancelled/);
    });

    test("bulk retry needs --yes and previews exactly what it will queue", async () => {
        await failedJob("test.e");
        await failedJob("test.e");
        await failedJob("test.e", "periodic:test.e");
        await failedJob("test.e", "media:dup");
        await failedJob("test.e", "media:dup");
        await enqueue(db, {
            type: "test.e",
            payload: {},
            maxAttempts: 1,
            dedupeKey: "periodic:test.e",
        });
        const dry = await run("retry", "--type", "test.e");
        // Two plain jobs, one of the two sharing media:dup, and not the one
        // whose dedupe key is already queued.
        assert.match(dry.out, /Would queue 3 failed jobs again/);
        const failedBefore = await db.execute(
            sql`SELECT count(*)::int AS n FROM jobs WHERE status = 'failed'`,
        );
        assert.equal((failedBefore.rows[0] as { n: number }).n, 5);

        const done = await run("retry", "--type", "test.e", "--yes");
        assert.match(done.out, /Queued 3 jobs again/);
    });

    test("cancel stops a queued job; bulk cancel needs a filter and --yes", async () => {
        const id = (await enqueue(db, {
            type: "test.f",
            payload: {},
            maxAttempts: 1,
        }))!;
        await enqueue(db, { type: "test.f", payload: {}, maxAttempts: 1 });
        assert.equal((await run("cancel", id)).code, 0);
        assert.equal((await getJob(db, id))!.status, "cancelled");
        assert.equal((await run("cancel", id)).code, 1);

        assert.equal((await run("cancel")).code, 2);
        assert.match(
            (await run("cancel", "--type", "test.f")).out,
            /Would cancel 1 queued or running jobs/,
        );
        assert.match(
            (await run("cancel", "--type", "test.f", "--yes")).out,
            /Cancelled 1 jobs/,
        );
    });

    test("workers lists each worker and whether it is live", async () => {
        await recordWorker(db, { id: "live-worker", classes: ["cpu", "io"] });
        await recordWorker(db, { id: "old-worker", classes: ["io"] });
        await db.execute(
            sql`UPDATE workers SET last_seen_at = now() - interval '10 minutes' WHERE id = 'old-worker'`,
        );
        const { out } = await run("workers");
        assert.match(out, /live-worker\s+cpu,io\s+.*\byes$/m);
        assert.match(out, /old-worker\s+io\s+.*\bno$/m);
    });

    test("bad input prints the usage", async () => {
        const result = await run("list", "--since", "soon");
        assert.equal(result.code, 2);
        assert.match(result.err, /Usage:/);
        assert.equal((await run("nonsense")).code, 2);
    });
});
