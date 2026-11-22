import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { Webhook } from "standardwebhooks";
import {
    createAccount,
    createApp,
    createMediaRecord,
    setDb,
    softDeleteApp,
    upsertDerivative,
} from "@/db";
import type { AppDb } from "../db/client.js";
import { claim, enqueue, complete, getJob } from "../jobs/queue.js";
import { JobError } from "../jobs/errors.js";
import { createRunner, type JobContext } from "../jobs/runner.js";
import {
    createTestPostgres,
    testPostgresUrl,
    type TestPostgres,
} from "../jobs/test-postgres.js";
import { finishDerivative, onProcessingSettled } from "../media/derivatives.js";
import type { CaptureEventInput } from "@codelitdev/observability";
import {
    flushEventsForTests,
    setEventSinkForTests,
} from "../services/events.js";
import {
    registerWebhookHooks,
    unregisterWebhookHooks,
    webhookDeliverJob,
} from "./delivery.js";
import type { GuardOptions, Resolver } from "./guard.js";
import {
    WEBHOOK_DELIVER_JOB,
    updateEndpoint,
    type DeliverPayload,
} from "./queries.js";
import {
    WebhookInputError,
    createWebhook,
    deleteWebhook,
    listWebhookDeliveries,
    listWebhooks,
    revealWebhookSecret,
    testWebhook,
    updateWebhook,
} from "./service.js";

const skip = testPostgresUrl
    ? false
    : "set JOBS_TEST_DATABASE_URL to run against real Postgres";

let pgTest: TestPostgres;
let db: AppDb;

type Received = {
    headers: http.IncomingHttpHeaders;
    body: string;
};

/** A local receiver. Each request takes the next status from `statuses`
 * (the last one repeats). */
function receiver() {
    const received: Received[] = [];
    let statuses = [200];
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            received.push({ headers: req.headers, body });
            const status =
                statuses[Math.min(received.length - 1, statuses.length - 1)];
            // A body the stored rows must never contain.
            res.writeHead(status).end("RECEIVER-SECRET-BODY");
        });
    });
    return {
        received,
        respond(next: number[]) {
            statuses = next;
            received.length = 0;
        },
        async start() {
            await new Promise<void>((resolve) =>
                server.listen(0, "127.0.0.1", resolve),
            );
            return (server.address() as AddressInfo).port;
        },
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
    };
}

const hooks = receiver();
let port = 0;
let hookUrl = "";

const toLocalhost: Resolver = async () => [{ address: "127.0.0.1", family: 4 }];

/** A self-hosted install whose receiver is on its own network. */
const localGuard: GuardOptions = {
    production: false,
    allowPrivateNetworks: true,
    resolver: toLocalhost,
};

const silent = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};

before(async () => {
    if (!testPostgresUrl) return;
    pgTest = await createTestPostgres(testPostgresUrl);
    db = pgTest.db;
    setDb(db);
    registerWebhookHooks();
    port = await hooks.start();
    hookUrl = `http://receiver.test:${port}/hooks`;
});

after(async () => {
    unregisterWebhookHooks();
    await hooks.close();
    await pgTest?.drop();
});

async function owner() {
    const user = await createAccount({
        email: `webhooks-${Date.now()}-${Math.random()}@example.com`,
    });
    const app = await createApp({
        userId: user.id,
        name: `App ${Math.random()}`,
    });
    return { user, app };
}

async function processingMedia(user: { id: string }, app: { id: string }) {
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
    await upsertDerivative(db, {
        mediaRowId: media.id,
        name: "poster",
        status: "queued",
    });
    return media;
}

async function deliveries(appId: string) {
    const result = await db.execute(
        sql`SELECT id, status, payload, media_id AS "mediaId", max_attempts AS "maxAttempts"
            FROM jobs WHERE app_id = ${appId} AND type = ${WEBHOOK_DELIVER_JOB}
            ORDER BY created_at`,
    );
    return result.rows as {
        id: string;
        status: string;
        payload: DeliverPayload;
        mediaId: string | null;
        maxAttempts: number;
    }[];
}

/** Keeps other tests' queued deliveries away from the runner. */
async function cancelQueuedDeliveries() {
    await db.execute(
        sql`UPDATE jobs SET status = 'cancelled', finished_at = now()
            WHERE type = ${WEBHOOK_DELIVER_JOB} AND status IN ('queued', 'running')`,
    );
}

function contextFor(job: { id: string }): JobContext {
    return {
        job: { id: job.id, attempts: 1, maxAttempts: 8 } as JobContext["job"],
        signal: new AbortController().signal,
        workerId: "test",
    };
}

async function waitFor<T>(
    check: () => Promise<T | undefined>,
    timeoutMs = 10_000,
): Promise<T> {
    const started = Date.now();
    for (;;) {
        const value = await check();
        if (value !== undefined) return value;
        if (Date.now() - started > timeoutMs) throw new Error("timed out");
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

describe("webhooks (Postgres)", { skip }, () => {
    beforeEach(() => hooks.respond([200]));

    test("endpoints can be created, listed, updated, rotated and deleted", async () => {
        const { app } = await owner();
        const created = await createWebhook(
            app.id,
            { url: hookUrl },
            { guard: localGuard },
        );
        assert.match(created.id, /^wh_/);
        assert.match(created.secret!, /^whsec_/);
        assert.equal(created.secretHint, `…${created.secret!.slice(-4)}`);
        assert.deepEqual(created.events, [
            "media.processing.ready",
            "media.processing.failed",
        ]);
        assert.equal(created.enabled, true);
        // Reading endpoints never returns the secret, only its hint.
        const { secret: createdSecret, ...withoutSecret } = created;
        assert.deepEqual(await listWebhooks(app.id), [withoutSecret]);
        assert.deepEqual(await revealWebhookSecret(app.id, created.id), {
            id: created.id,
            secret: createdSecret,
        });

        const updated = await updateWebhook(
            app.id,
            created.id,
            {
                enabled: false,
                events: ["media.processing.failed"],
                url: `${hookUrl}/v2`,
            },
            { guard: localGuard },
        );
        assert.equal(updated.enabled, false);
        assert.deepEqual(updated.events, ["media.processing.failed"]);
        assert.equal(updated.url, `${hookUrl}/v2`);
        assert.equal(updated.secret, undefined);
        assert.equal(updated.secretHint, created.secretHint);

        const rotated = await updateWebhook(app.id, created.id, {
            rotateSecret: true,
        });
        assert.notEqual(rotated.secret, created.secret);
        assert.match(rotated.secret!, /^whsec_/);
        assert.equal(
            (await revealWebhookSecret(app.id, created.id)).secret,
            rotated.secret,
        );
        await assert.rejects(
            revealWebhookSecret(app.id, "wh_missing"),
            /not found/,
        );

        await assert.rejects(
            updateWebhook(app.id, created.id, { events: ["media.uploaded"] }),
            WebhookInputError,
        );
        await assert.rejects(
            updateWebhook(app.id, created.id, {}),
            WebhookInputError,
        );
        // Another app can't see or change it.
        const other = await owner();
        await assert.rejects(
            updateWebhook(other.app.id, created.id, { enabled: true }),
            /not found/,
        );
        await assert.rejects(
            deleteWebhook(other.app.id, created.id),
            /not found/,
        );
        await assert.rejects(
            revealWebhookSecret(other.app.id, created.id),
            /not found/,
        );

        await deleteWebhook(app.id, created.id);
        assert.deepEqual(await listWebhooks(app.id), []);
    });

    test("a test event reaches the endpoint and its signature verifies with a Standard Webhooks library", async () => {
        const { app } = await owner();
        const endpoint = await createWebhook(
            app.id,
            { url: hookUrl },
            { guard: localGuard },
        );
        const result = await testWebhook(app.id, endpoint.id, {
            guard: localGuard,
        });
        assert.deepEqual(result, { result: "delivered", status: 200 });
        assert.equal(hooks.received.length, 1);
        const [request] = hooks.received;
        // Connected to the checked address, with the hostname kept.
        assert.equal(request.headers.host, `receiver.test:${port}`);
        const payload = new Webhook(endpoint.secret!).verify(request.body, {
            "webhook-id": String(request.headers["webhook-id"]),
            "webhook-timestamp": String(request.headers["webhook-timestamp"]),
            "webhook-signature": String(request.headers["webhook-signature"]),
        }) as { type: string; data: Record<string, unknown> };
        assert.equal(payload.type, "webhook.test");
        assert.deepEqual(payload.data, {
            appId: app.appId,
            endpointId: endpoint.id,
        });
    });

    test("the test action reports only delivered or failed with a status code or error class", async () => {
        const { app } = await owner();
        const endpoint = await createWebhook(
            app.id,
            { url: hookUrl },
            { guard: localGuard },
        );
        hooks.respond([503]);
        assert.deepEqual(
            await testWebhook(app.id, endpoint.id, { guard: localGuard }),
            { result: "failed", status: 503 },
        );
        const closed = http.createServer();
        await new Promise<void>((resolve) =>
            closed.listen(0, "127.0.0.1", resolve),
        );
        const closedPort = (closed.address() as AddressInfo).port;
        await new Promise<void>((resolve) => closed.close(() => resolve()));
        await updateEndpoint(app.id, endpoint.id, {
            url: `http://receiver.test:${closedPort}/x`,
        });
        assert.deepEqual(
            await testWebhook(app.id, endpoint.id, { guard: localGuard }),
            { result: "failed", error: "connection_failed" },
        );
        // Strict mode: the internal address is not even contacted.
        hooks.respond([200]);
        await updateEndpoint(app.id, endpoint.id, { url: hookUrl });
        assert.deepEqual(
            await testWebhook(app.id, endpoint.id, {
                guard: { ...localGuard, allowPrivateNetworks: false },
            }),
            { result: "failed", error: "blocked_address" },
        );
        assert.equal(hooks.received.length, 0);
    });

    test("URLs that resolve to refused addresses are refused at save unless private networks are allowed", async () => {
        const { app } = await owner();
        const strict = { ...localGuard, allowPrivateNetworks: false };
        for (const url of [
            hookUrl,
            "http://2130706433/hooks",
            "http://[::ffff:127.0.0.1]/hooks",
            "http://169.254.169.254/latest/meta-data",
        ]) {
            await assert.rejects(
                createWebhook(app.id, { url }, { guard: strict }),
                WebhookInputError,
                url,
            );
        }
        const created = await createWebhook(
            app.id,
            { url: "http://2130706433/hooks" },
            { guard: localGuard },
        );
        assert.equal(created.url, "http://127.0.0.1/hooks");
        await assert.rejects(
            updateWebhook(
                app.id,
                created.id,
                { url: hookUrl },
                { guard: strict },
            ),
            WebhookInputError,
        );
    });

    test("a hostname whose DNS answer changes from public to private is refused at delivery", async () => {
        const { app } = await owner();
        let answer = "93.184.215.14";
        const rebinding: GuardOptions = {
            production: false,
            allowPrivateNetworks: false,
            resolver: async () => [{ address: answer, family: 4 }],
        };
        const endpoint = await createWebhook(
            app.id,
            { url: hookUrl },
            { guard: rebinding },
        );
        answer = "127.0.0.1";
        assert.deepEqual(
            await testWebhook(app.id, endpoint.id, { guard: rebinding }),
            { result: "failed", error: "blocked_address" },
        );
        // The delivery job refuses it too, for good, without contacting it.
        const job = webhookDeliverJob({ guard: () => rebinding });
        const payload: DeliverPayload = {
            endpointId: endpoint.id,
            webhookId: "msg_rebind",
            event: "media.processing.ready",
            mediaId: null,
            body: "{}",
        };
        await assert.rejects(
            job.handler(payload, contextFor({ id: "rebind" })),
            (error: unknown) =>
                error instanceof JobError &&
                error.reason === "blocked_address" &&
                !error.retryable,
        );
        assert.equal(hooks.received.length, 0);
    });

    test("a status change queues exactly one delivery for each enabled, subscribed endpoint", async () => {
        const { user, app } = await owner();
        const create = (input: Record<string, unknown>) =>
            createWebhook(
                app.id,
                { url: hookUrl, ...input },
                { guard: localGuard },
            );
        const first = await create({});
        const second = await create({ events: ["media.processing.ready"] });
        await create({ enabled: false });
        await create({ events: ["media.processing.failed"] });
        const media = await processingMedia(user, app);

        await finishDerivative({
            mediaRowId: media.id,
            name: "poster",
            result: {
                status: "ready",
                output: { key: "poster.webp", mimeType: "image/webp", size: 1 },
            },
        });
        const queued = await deliveries(app.id);
        assert.deepEqual(
            queued.map((row) => row.payload.endpointId).sort(),
            [first.id, second.id].sort(),
        );
        for (const row of queued) {
            assert.equal(row.status, "queued");
            assert.equal(row.maxAttempts, 8);
            // Deleting the media must not drop the event.
            assert.equal(row.mediaId, null);
            assert.equal(row.payload.event, "media.processing.ready");
            assert.equal(JSON.stringify(row.payload).includes("whsec_"), false);
        }
        assert.equal(queued[0].payload.webhookId, queued[1].payload.webhookId);
        const body = JSON.parse(queued[0].payload.body);
        assert.equal(body.type, "media.processing.ready");
        assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
        // IDs and statuses only; no URLs.
        assert.deepEqual(body.data, {
            mediaId: media.mediaId,
            appId: app.appId,
            status: "ready",
            derivatives: { poster: { status: "ready" } },
        });

        // A failed media fires media.processing.failed with the error.
        const failing = await processingMedia(user, app);
        await finishDerivative({
            mediaRowId: failing.id,
            name: "poster",
            result: { status: "failed", error: "ffmpeg exited with 1" },
        });
        const failed = (await deliveries(app.id)).filter(
            (row) => row.payload.event === "media.processing.failed",
        );
        assert.equal(failed.length, 2);
        assert.deepEqual(JSON.parse(failed[0].payload.body).data.derivatives, {
            poster: { status: "failed", error: "ffmpeg exited with 1" },
        });
        await cancelQueuedDeliveries();
    });

    test("a rolled-back status change queues no delivery", async () => {
        const { user, app } = await owner();
        await createWebhook(app.id, { url: hookUrl }, { guard: localGuard });
        const media = await processingMedia(user, app);
        const stop = onProcessingSettled(async () => {
            throw new Error("later step failed");
        });
        try {
            await assert.rejects(
                finishDerivative({
                    mediaRowId: media.id,
                    name: "poster",
                    result: {
                        status: "ready",
                        output: { key: "poster.webp", size: 1 },
                    },
                }),
                /later step failed/,
            );
        } finally {
            stop();
        }
        assert.deepEqual(await deliveries(app.id), []);
        const status = await db.execute(
            sql`SELECT processing_status AS status FROM media WHERE id = ${media.id}`,
        );
        assert.equal(
            (status.rows[0] as { status: string }).status,
            "processing",
        );
    });

    test("a receiver that answers 500 then 200 gets the same webhook-id twice, and the delivery succeeds", async () => {
        await cancelQueuedDeliveries();
        const sent: CaptureEventInput[] = [];
        const restoreSink = setEventSinkForTests((input) => {
            sent.push(input);
        });
        const { user, app } = await owner();
        const endpoint = await createWebhook(
            app.id,
            { url: hookUrl },
            { guard: localGuard },
        );
        hooks.respond([500, 200]);
        const media = await processingMedia(user, app);
        await finishDerivative({
            mediaRowId: media.id,
            name: "poster",
            result: { status: "ready", output: { key: "p.webp", size: 1 } },
        });
        const [queued] = await deliveries(app.id);

        const runner = createRunner({
            db,
            workerId: "webhook-test-worker",
            definitions: [
                {
                    ...webhookDeliverJob({ guard: () => localGuard }),
                    // The real schedule waits 30 s before the second attempt.
                    retryDelayMs: () => 0,
                },
            ],
            classes: ["io"],
            concurrency: { cpu: 1, io: 4 },
            logger: silent,
            pollMs: 50,
        });
        await runner.start();
        try {
            const done = await waitFor(async () => {
                const job = await getJob(db, queued.id);
                return job?.status === "succeeded" ? job : undefined;
            });
            assert.equal(done.attempts, 2);
            assert.deepEqual(Object.keys(done.result as object).sort(), [
                "durationMs",
                "status",
            ]);
            assert.equal((done.result as { status: number }).status, 200);
        } finally {
            await runner.stop(1_000);
            await flushEventsForTests();
            restoreSink();
        }
        // The retried attempt isn't a failure for good, so it sends no event.
        assert.deepEqual(
            sent.map((e) => e.event),
            [
                "webhook.endpoint_changed",
                "media.processing.settled",
                "webhook.delivered",
            ],
        );
        const delivered = sent[2];
        assert.equal(delivered.subjectId, user.id);
        assert.deepEqual(delivered.groups, { app: app.appId });
        assert.equal(delivered.properties?.endpoint_id, endpoint.id);
        assert.equal(delivered.properties?.response_code, 200);
        assert.equal(delivered.properties?.attempts_made, 2);
        assert.doesNotMatch(JSON.stringify(sent), /https?:|127\.0\.0\.1/);
        assert.equal(hooks.received.length, 2);
        const ids = hooks.received.map((r) => r.headers["webhook-id"]);
        assert.equal(ids[0], ids[1]);
        assert.equal(ids[0], queued.payload.webhookId);
        for (const request of hooks.received) {
            assert.equal(request.body, queued.payload.body);
            new Webhook(endpoint.secret!).verify(request.body, {
                "webhook-id": String(request.headers["webhook-id"]),
                "webhook-timestamp": String(
                    request.headers["webhook-timestamp"],
                ),
                "webhook-signature": String(
                    request.headers["webhook-signature"],
                ),
            });
        }
        const [listed] = await listWebhookDeliveries(app.id);
        assert.equal(listed.id, queued.id);
        assert.equal(listed.status, "succeeded");
        assert.equal(listed.responseStatus, 200);
        assert.equal(listed.mediaId, media.mediaId);
    });

    test("stored delivery rows hold only a status code or a generic error class", async () => {
        await cancelQueuedDeliveries();
        const { app } = await owner();
        const endpoint = await createWebhook(
            app.id,
            { url: hookUrl },
            { guard: localGuard },
        );
        hooks.respond([500]);
        const failing = await enqueue(db, {
            type: WEBHOOK_DELIVER_JOB,
            payload: {
                endpointId: endpoint.id,
                webhookId: "msg_failing",
                event: "media.processing.ready",
                mediaId: null,
                body: "{}",
            } satisfies DeliverPayload,
            appId: app.id,
            maxAttempts: 1,
        });
        const unreachable = await createWebhook(
            app.id,
            { url: "http://receiver.test:1/hooks" },
            { guard: localGuard },
        );
        const refused = await enqueue(db, {
            type: WEBHOOK_DELIVER_JOB,
            payload: {
                endpointId: unreachable.id,
                webhookId: "msg_refused",
                event: "media.processing.ready",
                mediaId: null,
                body: "{}",
            } satisfies DeliverPayload,
            appId: app.id,
            maxAttempts: 1,
        });
        const runner = createRunner({
            db,
            workerId: "webhook-test-worker-2",
            definitions: [webhookDeliverJob({ guard: () => localGuard })],
            classes: ["io"],
            concurrency: { cpu: 1, io: 4 },
            logger: silent,
            pollMs: 50,
        });
        await runner.start();
        try {
            for (const id of [failing!, refused!]) {
                await waitFor(async () => {
                    const job = await getJob(db, id);
                    return job?.status === "failed" ? job : undefined;
                });
            }
        } finally {
            await runner.stop(1_000);
        }
        const rows = (
            await db.execute(
                sql`SELECT id, last_error AS "lastError", result FROM jobs
                    WHERE id IN (${failing}, ${refused})`,
            )
        ).rows as { id: string; lastError: string; result: any }[];
        const byId = new Map(rows.map((row) => [row.id, row]));
        const http500 = byId.get(failing!)!;
        assert.equal(http500.lastError, "http_status: endpoint answered 500");
        assert.deepEqual(Object.keys(http500.result).sort(), [
            "durationMs",
            "error",
            "status",
        ]);
        assert.equal(http500.result.status, 500);
        assert.equal(http500.result.error, "http_status");
        const down = byId.get(refused!)!;
        assert.equal(
            down.lastError,
            "connection_failed: delivery failed (connection_failed)",
        );
        assert.deepEqual(Object.keys(down.result).sort(), [
            "durationMs",
            "error",
        ]);
        for (const row of rows) {
            const text = JSON.stringify(row);
            assert.equal(text.includes("RECEIVER-SECRET-BODY"), false);
            assert.equal(
                /ECONNREFUSED|127\.0\.0\.1|receiver\.test/.test(text),
                false,
            );
        }
        const listed = await listWebhookDeliveries(app.id);
        for (const delivery of listed) {
            assert.equal(JSON.stringify(delivery).includes("RECEIVER"), false);
        }
    });

    test("soft-deleting an app removes its endpoints, cancels its deliveries and sends nothing, even for a claimed delivery", async () => {
        await cancelQueuedDeliveries();
        const { user, app } = await owner();
        await createWebhook(app.id, { url: hookUrl }, { guard: localGuard });
        await createWebhook(app.id, { url: hookUrl }, { guard: localGuard });
        const media = await processingMedia(user, app);
        await finishDerivative({
            mediaRowId: media.id,
            name: "poster",
            result: { status: "ready", output: { key: "p.webp", size: 1 } },
        });
        assert.equal((await deliveries(app.id)).length, 2);

        // A worker has already claimed one of them.
        const [claimed] = await claim(db, {
            types: [WEBHOOK_DELIVER_JOB],
            limit: 1,
            workerId: "claiming-worker",
            leaseMs: 60_000,
        });
        assert.equal(claimed.appId, app.id);
        assert.equal(claimed.status, "running");

        await softDeleteApp(user.id, app.appId);

        assert.deepEqual(await listWebhooks(app.id), []);
        const after = await deliveries(app.id);
        assert.deepEqual(
            after.map((row) => row.status),
            ["cancelled", "cancelled"],
        );
        // The claimed job runs anyway: it checks the app at send time.
        const outcome = await webhookDeliverJob({
            guard: () => localGuard,
        }).handler(claimed.payload as DeliverPayload, {
            job: claimed,
            signal: new AbortController().signal,
            workerId: "claiming-worker",
        });
        assert.deepEqual(outcome, { skipped: "endpoint_unavailable" });
        assert.equal(
            await complete(db, { id: claimed.id, workerId: "claiming-worker" }),
            false,
        );
        assert.equal(hooks.received.length, 0);
    });

    test("a delivery for a disabled or deleted endpoint is not sent", async () => {
        const { app } = await owner();
        const endpoint = await createWebhook(
            app.id,
            { url: hookUrl },
            { guard: localGuard },
        );
        const job = webhookDeliverJob({ guard: () => localGuard });
        const payload: DeliverPayload = {
            endpointId: endpoint.id,
            webhookId: "msg_disabled",
            event: "media.processing.ready",
            mediaId: null,
            body: "{}",
        };
        await updateWebhook(app.id, endpoint.id, { enabled: false });
        assert.deepEqual(await job.handler(payload, contextFor({ id: "a" })), {
            skipped: "endpoint_unavailable",
        });
        await deleteWebhook(app.id, endpoint.id);
        assert.deepEqual(await job.handler(payload, contextFor({ id: "b" })), {
            skipped: "endpoint_unavailable",
        });
        assert.equal(hooks.received.length, 0);
    });
});
