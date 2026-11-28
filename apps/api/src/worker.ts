/**
 * The worker process. Same image and code as the
 * API, started with `bun apps/api/src/worker.ts`. It runs queued jobs and
 * the periodic cleanup jobs, and serves `/health` and `/ready` on
 * WORKER_PORT for container probes.
 */
// First, so telemetry starts as `medialit-worker`.
import "./worker-process";
import { config as loadDotFile } from "dotenv";
loadDotFile();

import http from "node:http";
import { sql } from "drizzle-orm";
import {
    createGracefulShutdown,
    healthReport,
    readinessReport,
} from "@codelitdev/platform";
import { checkDatabaseConnection } from "./config/db";
import { closeDb, getDb } from "@/db";
import logger, {
    captureException,
    shutdownObservability,
} from "./services/log";
import { createRunner } from "./jobs/runner";
import { jobDefinitions, periodicJobs } from "./jobs/definitions";
import { pgListener } from "./jobs/listen";
import { newWorkerId, workerConfig } from "./jobs/config";
import { describeError } from "./jobs/errors";
import { jobTelemetryHooks } from "./jobs/telemetry";
import { startAlertChecks } from "./operations/alerts";
import { ALERTS_LOCK, collectWorkerAlerts } from "./operations/checks";
import { pageDeps } from "./operations/setup";
import { checkStorageConfig } from "./config/check-env";

async function main() {
    checkStorageConfig();
    const config = workerConfig();
    await checkDatabaseConnection();

    const workerId = newWorkerId();
    const db = getDb();
    const listener = pgListener(process.env.DATABASE_URL!, {
        onError: (error) =>
            logger.warn(
                { worker_id: workerId, error: describeError(error) },
                "job notifications connection failed",
            ),
    });
    const runner = createRunner({
        db,
        workerId,
        definitions: jobDefinitions,
        periodic: periodicJobs,
        classes: config.classes,
        concurrency: config.concurrency,
        logger,
        listen: listener.listen,
        ...jobTelemetryHooks(captureException),
    });
    let stopAlertChecks: () => Promise<void> = async () => undefined;

    let started = false;
    const shutdown = createGracefulShutdown({
        // Room for running jobs to finish, then for releasing the rest.
        timeoutMs: config.shutdownGraceMs + 5_000,
        hooks: [
            async () => {
                await stopAlertChecks();
                await runner.stop(config.shutdownGraceMs);
                await new Promise<void>((resolve) =>
                    server.close(() => resolve()),
                );
                await closeDb();
                await shutdownObservability(1_000);
            },
        ],
    });

    const server = http.createServer(async (req, res) => {
        const path = (req.url || "/").split("?")[0];
        if (req.method === "GET" && path === "/health") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(healthReport("medialit-worker")));
            return;
        }
        if (req.method === "GET" && path === "/ready") {
            let database = false;
            if (started && !shutdown.shuttingDown()) {
                try {
                    await db.execute(sql`select 1`);
                    database = true;
                } catch {
                    database = false;
                }
            }
            const report = readinessReport([
                { name: "started", ready: started },
                { name: "accepting_jobs", ready: !shutdown.shuttingDown() },
                { name: "database", ready: database },
            ]);
            res.writeHead(report.status === "ready" ? 200 : 503, {
                "content-type": "application/json",
            });
            res.end(JSON.stringify(report));
            return;
        }
        res.writeHead(404).end();
    });

    if (process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === "true") {
        logger.warn(
            { worker_id: workerId },
            "WEBHOOK_ALLOW_PRIVATE_NETWORKS is set: webhooks may be delivered to private and internal addresses. Never set it on a shared or hosted install.",
        );
    }
    await runner.start();
    // Only the worker holding the lock checks, so replicas page once.
    stopAlertChecks = startAlertChecks({
        check: async () =>
            (await listener.holdsLock(ALERTS_LOCK))
                ? collectWorkerAlerts(db, {
                      videoJobTypes: jobDefinitions
                          .filter((job) => job.class === "video")
                          .map((job) => job.type),
                  })
                : [],
        deps: pageDeps(db),
    });
    await new Promise<void>((resolve) => server.listen(config.port, resolve));
    started = true;
    logger.info(
        {
            worker_id: workerId,
            port: config.port,
            classes: config.classes.join(","),
            concurrency_cpu: config.concurrency.cpu,
            concurrency_io: config.concurrency.io,
            concurrency_video: config.concurrency.video,
            concurrency_transcribe: config.concurrency.transcribe,
        },
        "Medialit worker running",
    );

    const handleSignal = (signal: NodeJS.Signals) => {
        logger.info({ signal, worker_id: workerId }, "Shutting down");
        shutdown
            .shutdown()
            .then(() => process.exit(0))
            .catch((error) => {
                logger.error(
                    { error: describeError(error) },
                    "Graceful shutdown failed",
                );
                process.exit(1);
            });
    };
    process.on("SIGTERM", handleSignal);
    process.on("SIGINT", handleSignal);
}

main().catch((error) => {
    logger.error({ error: describeError(error) }, "Worker failed to start");
    process.exit(1);
});
