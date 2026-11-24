import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import pg from "pg";
import { setDb, type AppDb } from "../db/client.js";
import {
    createAccount,
    createApp,
    createMediaRecord,
    deleteMediaById,
} from "../db/repository.js";
import { permanentError, retryableError } from "./errors.js";
import {
    cancel,
    claim,
    complete,
    enqueue,
    fail,
    getJob,
    heartbeat,
    JOBS_CHANNEL,
    liveWorkerClasses,
    prune,
    reap,
    recordWorker,
    release,
    schedulePeriodic,
} from "./queue.js";
import {
    createRunner,
    retryDelayMs,
    type JobDefinition,
    type RunnerLogger,
} from "./runner.js";
import { pgListener } from "./listen.js";
import { missingWorkerClasses } from "./runner.js";
import {
    createTestPostgres,
    testPostgresUrl,
    type TestPostgres,
} from "./test-postgres.js";

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

let typeCount = 0;
/** A job type no other test uses, so tests don't claim each other's jobs. */
function newType(): string {
    typeCount += 1;
    return `test.type_${typeCount}_${Date.now()}`;
}

async function mediaFixture() {
    const user = await createAccount({
        email: `jobs-${Date.now()}-${Math.random()}@example.com`,
    });
    const app = await createApp({
        userId: user.id,
        name: `App ${Math.random()}`,
    });
    const record = await createMediaRecord({
        fileName: "main.png",
        mediaId: `media-${Math.random().toString(36).slice(2)}`,
        userId: user.id,
        appId: app.id,
        originalFileName: "a.png",
        mimeType: "image/png",
        size: 1,
        thumbnailGenerated: false,
        accessControl: "private",
        temp: false,
    });
    return { user, app, media: record };
}

async function backdateLease(id: string) {
    await db.execute(
        sql`UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = ${id}`,
    );
}

async function makeDue(id: string) {
    await db.execute(
        sql`UPDATE jobs SET run_at = now() - interval '1 second' WHERE id = ${id}`,
    );
}

function quietLogger() {
    const lines: Array<{ level: string; message: string; context: any }> = [];
    const log =
        (level: string) =>
        (context: Record<string, unknown>, message: string) =>
            lines.push({ level, message, context });
    const logger: RunnerLogger = {
        debug: log("debug"),
        info: log("info"),
        warn: log("warn"),
        error: log("error"),
    };
    return { logger, lines };
}

async function waitFor<T>(
    check: () => Promise<T | undefined | null | false>,
    timeoutMs = 10_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await check();
        if (value) return value;
        if (Date.now() > deadline) throw new Error("timed out waiting");
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

describe("job queue (Postgres)", { skip }, () => {
    test("claims due jobs once, by priority, and leases them", async () => {
        const type = newType();
        const low = await enqueue(db, {
            type,
            payload: { n: 1 },
            maxAttempts: 3,
        });
        const high = await enqueue(db, {
            type,
            payload: { n: 2 },
            maxAttempts: 3,
            priority: 10,
        });
        const later = await enqueue(db, {
            type,
            payload: { n: 3 },
            maxAttempts: 3,
            delayMs: 60_000,
        });

        const first = await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w1",
            leaseMs: 60_000,
        });
        assert.deepEqual(
            first.map((job) => job.id),
            [high],
        );
        assert.equal(first[0].status, "running");
        assert.equal(first[0].attempts, 1);
        assert.equal(first[0].lockedBy, "w1");
        assert.deepEqual(first[0].payload, { n: 2 });
        assert.ok(first[0].lockedUntil! > new Date());

        const rest = await claim(db, {
            types: [type],
            limit: 10,
            workerId: "w2",
            leaseMs: 60_000,
        });
        assert.deepEqual(
            rest.map((job) => job.id),
            [low],
            "the delayed job is not due",
        );
        assert.equal((await getJob(db, later!))!.status, "queued");
    });

    test("two workers racing never claim the same job", async () => {
        const type = newType();
        for (let i = 0; i < 50; i++) {
            await enqueue(db, { type, payload: { i }, maxAttempts: 1 });
        }
        // SKIP LOCKED lets a round of racing claims return fewer jobs than
        // remain, even none, so race in rounds until none is queued.
        const queued = async () =>
            Number(
                (
                    await db.execute(
                        sql`SELECT count(*) AS n FROM jobs
                            WHERE type = ${type} AND status = 'queued'`,
                    )
                ).rows[0].n,
            );
        const ids: string[] = [];
        for (let round = 0; round < 50 && (await queued()) > 0; round++) {
            const claims = await Promise.all(
                Array.from({ length: 10 }, (_, i) =>
                    claim(db, {
                        types: [type],
                        limit: 7,
                        workerId: `racer-${i}`,
                        leaseMs: 60_000,
                    }),
                ),
            );
            ids.push(...claims.flat().map((job) => job.id));
        }
        assert.equal(new Set(ids).size, ids.length, "no job claimed twice");
        assert.equal(ids.length, 50);
    });

    test("dedupe key allows one queued or running job", async () => {
        const type = newType();
        const key = `dedupe-${type}`;
        const first = await enqueue(db, {
            type,
            payload: {},
            maxAttempts: 1,
            dedupeKey: key,
        });
        assert.ok(first);
        assert.equal(
            await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 1,
                dedupeKey: key,
            }),
            null,
        );
        const [job] = await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w",
            leaseMs: 60_000,
        });
        assert.equal(
            await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 1,
                dedupeKey: key,
            }),
            null,
            "still running",
        );
        await complete(db, { id: job.id, workerId: "w" });
        assert.ok(
            await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 1,
                dedupeKey: key,
            }),
        );
    });

    test("heartbeat extends only jobs the worker still owns", async () => {
        const type = newType();
        await enqueue(db, { type, payload: {}, maxAttempts: 1 });
        await enqueue(db, { type, payload: {}, maxAttempts: 1 });
        const [a, b] = await claim(db, {
            types: [type],
            limit: 2,
            workerId: "w",
            leaseMs: 1_000,
        });
        await cancel(db, { id: b.id });
        const owned = await heartbeat(db, {
            workerId: "w",
            ids: [a.id, b.id],
            leaseMs: 60_000,
        });
        assert.deepEqual([...owned], [a.id]);
        assert.deepEqual(
            [
                ...(await heartbeat(db, {
                    workerId: "other",
                    ids: [a.id],
                    leaseMs: 60_000,
                })),
            ],
            [],
        );
        const extended = await getJob(db, a.id);
        assert.ok(extended!.lockedUntil!.getTime() > Date.now() + 30_000);
    });

    test("retries a retryable failure until attempts run out", async () => {
        const type = newType();
        const id = (await enqueue(db, { type, payload: {}, maxAttempts: 2 }))!;
        await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w",
            leaseMs: 60_000,
        });
        assert.equal(
            await fail(db, {
                id,
                workerId: "w",
                error: "boom",
                retryable: true,
                retryInMs: 60_000,
            }),
            "retry",
        );
        let job = (await getJob(db, id))!;
        assert.equal(job.status, "queued");
        assert.equal(job.lastError, "boom");
        assert.ok(job.runAt.getTime() > Date.now() + 30_000, "backed off");
        assert.equal(job.finishedAt, null);

        await makeDue(id);
        await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w",
            leaseMs: 60_000,
        });
        assert.equal(
            await fail(db, {
                id,
                workerId: "w",
                error: "boom again",
                retryable: true,
                retryInMs: 0,
            }),
            "failed",
        );
        job = (await getJob(db, id))!;
        assert.equal(job.status, "failed");
        assert.equal(job.attempts, 2);
        assert.ok(job.finishedAt);
    });

    test("a permanent failure fails at once, and only the owner can fail it", async () => {
        const type = newType();
        const id = (await enqueue(db, { type, payload: {}, maxAttempts: 5 }))!;
        await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w",
            leaseMs: 60_000,
        });
        assert.equal(
            await fail(db, {
                id,
                workerId: "intruder",
                error: "x",
                retryable: false,
                retryInMs: 0,
            }),
            "lost",
        );
        assert.equal(
            await fail(db, {
                id,
                workerId: "w",
                error: "bad",
                retryable: false,
                retryInMs: 0,
                result: { status: 400 },
            }),
            "failed",
        );
        const job = (await getJob(db, id))!;
        assert.equal(job.status, "failed");
        assert.deepEqual(job.result, { status: 400 });
    });

    test("the reaper requeues expired leases and fails exhausted ones", async () => {
        const type = newType();
        const retryable = (await enqueue(db, {
            type,
            payload: {},
            maxAttempts: 2,
        }))!;
        const exhausted = (await enqueue(db, {
            type,
            payload: {},
            maxAttempts: 1,
        }))!;
        await claim(db, {
            types: [type],
            limit: 2,
            workerId: "dead",
            leaseMs: 60_000,
        });
        await backdateLease(retryable);
        await backdateLease(exhausted);

        const reaped = await reap(db);
        const byId = new Map(reaped.map((job) => [job.id, job]));
        assert.equal(byId.get(retryable)?.status, "queued");
        assert.equal(byId.get(retryable)?.lockedBy, "dead");
        assert.equal(byId.get(exhausted)?.status, "failed");

        const requeued = (await getJob(db, retryable))!;
        assert.equal(requeued.lockedBy, null);
        assert.equal(requeued.lastError, "lease expired");
        assert.equal(
            await complete(db, { id: retryable, workerId: "dead" }),
            false,
            "the dead worker can't finish it",
        );
    });

    test("release gives jobs back without counting the attempt", async () => {
        const type = newType();
        const id = (await enqueue(db, { type, payload: {}, maxAttempts: 1 }))!;
        await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w",
            leaseMs: 60_000,
        });
        assert.equal(await release(db, { workerId: "w", ids: [id] }), 1);
        const job = (await getJob(db, id))!;
        assert.equal(job.status, "queued");
        assert.equal(job.attempts, 0);
    });

    test("deleting the media deletes its jobs", async () => {
        const { media } = await mediaFixture();
        const id = (await enqueue(db, {
            type: newType(),
            payload: {},
            maxAttempts: 1,
            mediaId: media.id,
            appId: media.appId,
        }))!;
        await deleteMediaById(media.id);
        assert.equal(await getJob(db, id), null);
    });

    test("cancel by app stops queued and running jobs only", async () => {
        const { app } = await mediaFixture();
        const type = newType();
        const queued = (await enqueue(db, {
            type,
            payload: {},
            maxAttempts: 1,
            appId: app.id,
        }))!;
        const done = (await enqueue(db, {
            type,
            payload: {},
            maxAttempts: 1,
            appId: app.id,
        }))!;
        const [claimed] = await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w",
            leaseMs: 60_000,
        });
        assert.equal(claimed.id, queued);
        await complete(db, { id: queued, workerId: "w" });
        assert.equal(await cancel(db, { appId: app.id }), 1);
        assert.equal((await getJob(db, done))!.status, "cancelled");
        assert.equal((await getJob(db, queued))!.status, "succeeded");
    });

    test("periodic jobs are queued once and wait for their interval", async () => {
        const type = newType();
        assert.equal(
            await schedulePeriodic(db, { type, everyMs: 3_600_000 }),
            true,
        );
        assert.equal(
            await schedulePeriodic(db, { type, everyMs: 3_600_000 }),
            false,
        );
        const [job] = await claim(db, {
            types: [type],
            limit: 1,
            workerId: "w",
            leaseMs: 60_000,
        });
        assert.equal(job.maxAttempts, 1);
        await complete(db, { id: job.id, workerId: "w" });
        assert.equal(
            await schedulePeriodic(db, { type, everyMs: 3_600_000 }),
            true,
        );
        assert.deepEqual(
            await claim(db, {
                types: [type],
                limit: 1,
                workerId: "w",
                leaseMs: 60_000,
            }),
            [],
            "the next run is an hour after the last one finished",
        );
    });

    test("prune deletes old finished jobs and stale workers", async () => {
        const type = newType();
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
            ids.push(
                (await enqueue(db, { type, payload: {}, maxAttempts: 1 }))!,
            );
        }
        const [oldDone, recentDone, oldFailed, monthFailed] = ids;
        await db.execute(
            sql`UPDATE jobs SET status = 'succeeded', finished_at = now() - interval '8 days' WHERE id = ${oldDone}`,
        );
        await db.execute(
            sql`UPDATE jobs SET status = 'succeeded', finished_at = now() - interval '6 days' WHERE id = ${recentDone}`,
        );
        await db.execute(
            sql`UPDATE jobs SET status = 'failed', finished_at = now() - interval '8 days' WHERE id = ${oldFailed}`,
        );
        await db.execute(
            sql`UPDATE jobs SET status = 'failed', finished_at = now() - interval '31 days' WHERE id = ${monthFailed}`,
        );
        await recordWorker(db, { id: "stale-worker", classes: ["io"] });
        await db.execute(
            sql`UPDATE workers SET last_seen_at = now() - interval '2 days' WHERE id = 'stale-worker'`,
        );

        await prune(db);
        assert.equal(await getJob(db, oldDone), null);
        assert.ok(await getJob(db, recentDone));
        assert.ok(await getJob(db, oldFailed));
        assert.equal(await getJob(db, monthFailed), null);
        const left = await db.execute(
            sql`SELECT id FROM workers WHERE id = 'stale-worker'`,
        );
        assert.equal(left.rows.length, 0);
    });

    test("enqueue notifies listeners when the transaction commits", async () => {
        const client = new pg.Client({ connectionString: pgTest.url });
        await client.connect();
        const received: string[] = [];
        client.on("notification", (message) => {
            if (message.channel === JOBS_CHANNEL)
                received.push(message.payload!);
        });
        await client.query(`LISTEN ${JOBS_CHANNEL}`);
        const type = newType();
        try {
            await db.transaction(async (tx) => {
                await enqueue(tx, { type, payload: {}, maxAttempts: 1 });
                await new Promise((resolve) => setTimeout(resolve, 200));
                assert.deepEqual(received, [], "not before commit");
            });
            await waitFor(async () => received.includes(type));
        } finally {
            await client.end();
        }
    });
});

describe("job runner (Postgres)", { skip }, () => {
    function runnerFor(
        definitions: JobDefinition[],
        options: Partial<Parameters<typeof createRunner>[0]> = {},
    ) {
        const { logger, lines } = quietLogger();
        const runner = createRunner({
            db,
            workerId: `runner-${Math.random().toString(36).slice(2)}`,
            definitions,
            classes: ["cpu", "io"],
            concurrency: { cpu: 2, io: 4, video: 1 },
            logger,
            pollMs: 100,
            heartbeatMs: 100,
            maintenanceMs: 200,
            leaseMs: 2_000,
            retryBaseMs: 10,
            retryMaxMs: 20,
            ...options,
        });
        return { runner, lines };
    }

    test("runs a job, stores its result and logs each state", async () => {
        const type = newType();
        const { runner, lines } = runnerFor([
            {
                type,
                class: "io",
                maxAttempts: 1,
                handler: async (payload: { n: number }) => ({
                    doubled: payload.n * 2,
                }),
            },
        ]);
        await runner.start();
        try {
            const id = (await enqueue(db, {
                type,
                payload: { n: 21 },
                maxAttempts: 1,
            }))!;
            const job = await waitFor(async () => {
                const row = await getJob(db, id);
                return row?.status === "succeeded" && row;
            });
            assert.deepEqual(job.result, { doubled: 42 });
            assert.ok(
                lines.some(
                    (line) =>
                        line.message === "job claimed" &&
                        line.context.job_id === id,
                ),
            );
            const succeeded = lines.find(
                (line) =>
                    line.message === "job succeeded" &&
                    line.context.job_id === id,
            );
            assert.ok(succeeded);
            assert.equal(succeeded.context.job_type, type);
            assert.equal(typeof succeeded.context.duration_ms, "number");
        } finally {
            await runner.stop(1_000);
        }
    });

    test("retries, then fails for good and reports it once", async () => {
        const type = newType();
        let calls = 0;
        const failed: string[] = [];
        const { runner, lines } = runnerFor(
            [
                {
                    type,
                    class: "io",
                    maxAttempts: 3,
                    handler: async () => {
                        calls += 1;
                        throw retryableError("storage down", "storage");
                    },
                },
            ],
            {
                onJobFailed: (event) =>
                    failed.push(`${event.job.id}:${event.reason}`),
            },
        );
        await runner.start();
        try {
            const id = (await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 3,
            }))!;
            await waitFor(
                async () => (await getJob(db, id))?.status === "failed",
            );
            assert.equal(calls, 3);
            assert.deepEqual(failed, [`${id}:storage`]);
            assert.equal(
                lines.filter((line) => line.message === "job will retry")
                    .length,
                2,
            );
            assert.equal(
                lines.filter((line) => line.message === "job failed").length,
                1,
            );
        } finally {
            await runner.stop(1_000);
        }
    });

    test("a permanent error is not retried", async () => {
        const type = newType();
        let calls = 0;
        const { runner } = runnerFor([
            {
                type,
                class: "io",
                maxAttempts: 5,
                handler: async () => {
                    calls += 1;
                    throw permanentError(
                        "bad input https://secret.example/x?sig=1",
                    );
                },
            },
        ]);
        await runner.start();
        try {
            const id = (await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 5,
            }))!;
            const job = await waitFor(async () => {
                const row = await getJob(db, id);
                return row?.status === "failed" && row;
            });
            assert.equal(calls, 1);
            assert.equal(
                job.lastError,
                "bad_input: bad input [url]",
                "the reason, and no URLs",
            );
        } finally {
            await runner.stop(1_000);
        }
    });

    test("deleting the media aborts its running job", async () => {
        const type = newType();
        const { media } = await mediaFixture();
        let started = false;
        let aborted = false;
        const { runner, lines } = runnerFor([
            {
                type,
                class: "cpu",
                maxAttempts: 1,
                handler: (_payload, { signal }) =>
                    new Promise((_resolve, reject) => {
                        started = true;
                        signal.addEventListener("abort", () => {
                            aborted = true;
                            reject(signal.reason);
                        });
                    }),
            },
        ]);
        await runner.start();
        try {
            const id = (await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 1,
                mediaId: media.id,
                appId: media.appId,
            }))!;
            await waitFor(async () => started);
            await deleteMediaById(media.id);
            await waitFor(async () => aborted);
            await waitFor(async () =>
                lines.some(
                    (line) =>
                        line.message === "job cancelled" &&
                        line.context.job_id === id,
                ),
            );
            assert.equal(runner.activeCount(), 0);
        } finally {
            await runner.stop(1_000);
        }
    });

    test("a job over its timeout is aborted and retried", async () => {
        const type = newType();
        let calls = 0;
        const { runner } = runnerFor([
            {
                type,
                class: "io",
                maxAttempts: 2,
                timeoutMs: 100,
                handler: (_payload, { signal }) => {
                    calls += 1;
                    if (calls > 1) return Promise.resolve("ok");
                    return new Promise((_resolve, reject) =>
                        signal.addEventListener("abort", () =>
                            reject(signal.reason),
                        ),
                    );
                },
            },
        ]);
        await runner.start();
        try {
            const id = (await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 2,
            }))!;
            const job = await waitFor(async () => {
                const row = await getJob(db, id);
                return row?.status === "succeeded" && row;
            });
            assert.equal(calls, 2);
            assert.equal(job.attempts, 2);
        } finally {
            await runner.stop(1_000);
        }
    });

    test("respects each class's concurrency", async () => {
        const type = newType();
        let running = 0;
        let peak = 0;
        const { runner } = runnerFor(
            [
                {
                    type,
                    class: "cpu",
                    maxAttempts: 1,
                    handler: async () => {
                        running += 1;
                        peak = Math.max(peak, running);
                        await new Promise((resolve) =>
                            setTimeout(resolve, 100),
                        );
                        running -= 1;
                    },
                },
            ],
            { concurrency: { cpu: 2, io: 1, video: 1 } },
        );
        const ids: string[] = [];
        for (let i = 0; i < 6; i++) {
            ids.push(
                (await enqueue(db, { type, payload: {}, maxAttempts: 1 }))!,
            );
        }
        await runner.start();
        try {
            await waitFor(async () => {
                const result = await db.execute(
                    sql`SELECT count(*)::int AS n FROM jobs WHERE type = ${type} AND status = 'succeeded'`,
                );
                return (result.rows[0] as { n: number }).n === 6;
            });
            assert.equal(peak, 2);
        } finally {
            await runner.stop(1_000);
        }
    });

    test("a worker only runs the classes it serves", async () => {
        const cpuType = newType();
        const ioType = newType();
        const handler = async () => "done";
        const { runner } = runnerFor(
            [
                { type: cpuType, class: "cpu", maxAttempts: 1, handler },
                { type: ioType, class: "io", maxAttempts: 1, handler },
            ],
            { classes: ["io"] },
        );
        await runner.start();
        try {
            const cpuJob = (await enqueue(db, {
                type: cpuType,
                payload: {},
                maxAttempts: 1,
            }))!;
            const ioJob = (await enqueue(db, {
                type: ioType,
                payload: {},
                maxAttempts: 1,
            }))!;
            await waitFor(
                async () => (await getJob(db, ioJob))?.status === "succeeded",
            );
            assert.equal((await getJob(db, cpuJob))!.status, "queued");
            const live = await liveWorkerClasses(db, 60_000);
            assert.ok(live.has("io"));
        } finally {
            await runner.stop(1_000);
        }
    });

    test("a notification wakes the runner before the next poll", async () => {
        const type = newType();
        const { runner } = runnerFor(
            [{ type, class: "io", maxAttempts: 1, handler: async () => "ok" }],
            {
                pollMs: 60_000,
                listen: pgListener(pgTest.url, { onError: () => undefined })
                    .listen,
            },
        );
        await runner.start();
        try {
            const queuedAt = Date.now();
            const id = (await enqueue(db, {
                type,
                payload: {},
                maxAttempts: 1,
            }))!;
            await waitFor(
                async () => (await getJob(db, id))?.status === "succeeded",
                3_000,
            );
            assert.ok(Date.now() - queuedAt < 3_000);
        } finally {
            await runner.stop(1_000);
        }
    });

    test("shutdown waits for running jobs, then releases the rest", async () => {
        const quick = newType();
        const stuck = newType();
        let quickDone = false;
        const { runner } = runnerFor([
            {
                type: quick,
                class: "io",
                maxAttempts: 1,
                handler: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    quickDone = true;
                },
            },
            {
                type: stuck,
                class: "io",
                maxAttempts: 1,
                handler: (_payload, { signal }) =>
                    new Promise((_resolve, reject) =>
                        signal.addEventListener("abort", () =>
                            reject(signal.reason),
                        ),
                    ),
            },
        ]);
        await runner.start();
        const quickId = (await enqueue(db, {
            type: quick,
            payload: {},
            maxAttempts: 1,
        }))!;
        const stuckId = (await enqueue(db, {
            type: stuck,
            payload: {},
            maxAttempts: 1,
        }))!;
        await waitFor(async () => runner.activeCount() === 2);
        await runner.stop(500);
        assert.ok(quickDone);
        assert.equal((await getJob(db, quickId))!.status, "succeeded");
        const released = (await getJob(db, stuckId))!;
        assert.equal(released.status, "queued");
        assert.equal(released.attempts, 0);
        assert.equal(released.lockedBy, null);
    });

    test("the reaper in a live runner takes back a dead worker's job", async () => {
        const type = newType();
        const id = (await enqueue(db, { type, payload: {}, maxAttempts: 2 }))!;
        await claim(db, {
            types: [type],
            limit: 1,
            workerId: "crashed",
            leaseMs: 60_000,
        });
        await backdateLease(id);
        let reaped = 0;
        const { runner } = runnerFor(
            [{ type, class: "io", maxAttempts: 2, handler: async () => "ok" }],
            {
                onReaped: (jobs) =>
                    (reaped += jobs.filter((job) => job.id === id).length),
            },
        );
        await runner.start();
        try {
            const job = await waitFor(async () => {
                const row = await getJob(db, id);
                return row?.status === "succeeded" && row;
            });
            assert.equal(job.attempts, 2);
            assert.equal(reaped, 1);
        } finally {
            await runner.stop(1_000);
        }
    });

    test("periodic jobs are queued by the runner and run", async () => {
        const type = newType();
        let runs = 0;
        const { runner } = runnerFor(
            [
                {
                    type,
                    class: "io",
                    maxAttempts: 1,
                    handler: async () => {
                        runs += 1;
                    },
                },
            ],
            { periodic: [{ type, everyMs: 3_600_000 }] },
        );
        await runner.start();
        try {
            await waitFor(async () => runs === 1);
            await runner.maintain();
            await new Promise((resolve) => setTimeout(resolve, 300));
            assert.equal(runs, 1, "not again before its interval");
        } finally {
            await runner.stop(1_000);
        }
    });
});

describe("worker liveness (Postgres)", { skip }, () => {
    test("reports classes with no worker seen in 5 minutes", async () => {
        await db.execute(sql`DELETE FROM workers`);
        assert.deepEqual(await missingWorkerClasses(db), [
            "cpu",
            "io",
            "video",
        ]);
        await recordWorker(db, { id: "io-only", classes: ["io"] });
        assert.deepEqual(await missingWorkerClasses(db), ["cpu", "video"]);
        await recordWorker(db, { id: "old-cpu", classes: ["cpu"] });
        await db.execute(
            sql`UPDATE workers SET last_seen_at = now() - interval '6 minutes' WHERE id = 'old-cpu'`,
        );
        assert.deepEqual(await missingWorkerClasses(db), ["cpu", "video"]);
    });
});

describe("retryDelayMs", () => {
    test("doubles from 30 s, caps at 1 h, with jitter between half and all", () => {
        assert.equal(
            retryDelayMs(1, () => 1),
            30_000,
        );
        assert.equal(
            retryDelayMs(2, () => 1),
            60_000,
        );
        assert.equal(
            retryDelayMs(3, () => 0),
            60_000,
        );
        assert.equal(
            retryDelayMs(20, () => 1),
            3_600_000,
        );
        assert.equal(
            retryDelayMs(100, () => 1),
            3_600_000,
        );
    });
});
