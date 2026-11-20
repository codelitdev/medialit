/**
 * Runs queued jobs (pipelines-phase-0.md, section 5). One runner per worker
 * process. It claims jobs for the classes it serves, renews their leases
 * while they run, aborts a job whose row was cancelled or deleted, takes
 * back expired leases, and queues the periodic jobs.
 */
import { describeError, JobError, type FailedReason } from "./errors";
import {
    claim,
    complete,
    fail,
    heartbeat,
    reap,
    recordWorker,
    release,
    removeWorker,
    schedulePeriodic,
    type Executor,
    type JobRow,
} from "./queue";

export const JOB_CLASSES = ["cpu", "io"] as const;
export type JobClass = (typeof JOB_CLASSES)[number];

export type JobContext = {
    job: JobRow;
    /** Fires when the job is cancelled or deleted, times out, or the worker
     * shuts down. Handlers pass it to anything slow (fetch, child processes). */
    signal: AbortSignal;
    workerId: string;
};

export type JobDefinition<P = any> = {
    type: string;
    class: JobClass;
    maxAttempts: number;
    /** Aborts an attempt that runs longer, as a retryable `timeout`. */
    timeoutMs?: number;
    /** Returns what is stored in `jobs.result`. Throws a `JobError` to say
     * whether to retry. */
    handler: (payload: P, context: JobContext) => Promise<unknown>;
};

export type PeriodicJob = {
    type: string;
    everyMs: number;
};

export type RunnerLogger = {
    debug: (context: Record<string, unknown>, message: string) => void;
    info: (context: Record<string, unknown>, message: string) => void;
    warn: (context: Record<string, unknown>, message: string) => void;
    error: (context: Record<string, unknown>, message: string) => void;
};

export const RUNNER_DEFAULTS = {
    leaseMs: 60_000,
    heartbeatMs: 20_000,
    pollMs: 5_000,
    maintenanceMs: 30_000,
    retryBaseMs: 30_000,
    retryMaxMs: 60 * 60 * 1000,
};

export type RunnerOptions = {
    db: Executor;
    workerId: string;
    definitions: readonly JobDefinition[];
    periodic?: readonly PeriodicJob[];
    classes: readonly JobClass[];
    concurrency: Record<JobClass, number>;
    logger: RunnerLogger;
    /** Subscribes to job notifications; returns a function that unsubscribes. */
    listen?: (onNotify: () => void) => Promise<() => Promise<void>>;
    /** Called when a job fails for good or its lease is reaped. */
    onJobFailed?: (event: {
        job: JobRow;
        reason: FailedReason;
        error: string;
    }) => void;
    onReaped?: (jobs: Awaited<ReturnType<typeof reap>>) => void;
    onRunnerError?: (error: unknown, step: string) => void;
    random?: () => number;
} & Partial<typeof RUNNER_DEFAULTS>;

export type Runner = {
    start: () => Promise<void>;
    /** Stops claiming, waits up to `graceMs` for running jobs, then aborts
     * and releases the rest so another worker picks them up. */
    stop: (graceMs: number) => Promise<void>;
    /** Wakes the runner as a notification would. */
    wake: () => void;
    activeCount: () => number;
    /** Runs the reaper, the periodic scheduler and the worker heartbeat now. */
    maintain: () => Promise<void>;
};

/** Exponential backoff with jitter: base × 2^(attempt−1), capped, then
 * scaled by a random factor between 0.5 and 1. */
export function retryDelayMs(
    attempt: number,
    random: () => number = Math.random,
    baseMs = RUNNER_DEFAULTS.retryBaseMs,
    maxMs = RUNNER_DEFAULTS.retryMaxMs,
): number {
    const exponent = Math.max(0, attempt - 1);
    const delay = Math.min(maxMs, baseMs * 2 ** Math.min(exponent, 30));
    return Math.round(delay * (0.5 + random() * 0.5));
}

type Active = {
    job: JobRow;
    controller: AbortController;
    /** Why it was aborted, if it was. */
    abortedFor?: "lost" | "timeout" | "shutdown";
    startedAt: number;
    done: Promise<void>;
};

export function createRunner(options: RunnerOptions): Runner {
    const settings = { ...RUNNER_DEFAULTS };
    for (const key of Object.keys(RUNNER_DEFAULTS) as Array<
        keyof typeof RUNNER_DEFAULTS
    >) {
        if (options[key] !== undefined) settings[key] = options[key];
    }
    const { db, workerId, logger } = options;
    const random = options.random ?? Math.random;
    const definitions = new Map(
        options.definitions.map((definition) => [definition.type, definition]),
    );
    const typesByClass = new Map<JobClass, string[]>();
    for (const jobClass of options.classes) {
        typesByClass.set(
            jobClass,
            options.definitions
                .filter((definition) => definition.class === jobClass)
                .map((definition) => definition.type),
        );
    }
    const periodic = (options.periodic ?? []).filter((job) => {
        const definition = definitions.get(job.type);
        return definition && options.classes.includes(definition.class);
    });

    const active = new Map<string, Active>();
    const claiming = new Set<JobClass>();
    const claimAgain = new Set<JobClass>();
    const timers: NodeJS.Timeout[] = [];
    let unlisten: (() => Promise<void>) | undefined;
    let stopping = false;
    let maintaining: Promise<void> | undefined;
    /** Claims and heartbeats in flight, which `stop` waits for. */
    const inflight = new Set<Promise<void>>();

    function track(work: Promise<void>) {
        inflight.add(work);
        void work.finally(() => inflight.delete(work));
    }

    function reportError(error: unknown, step: string) {
        logger.error(
            { step, worker_id: workerId, error: describeError(error) },
            "job runner error",
        );
        options.onRunnerError?.(error, step);
    }

    function activeIn(jobClass: JobClass): number {
        let count = 0;
        for (const entry of active.values()) {
            if (definitions.get(entry.job.type)?.class === jobClass) count++;
        }
        return count;
    }

    async function fill(jobClass: JobClass): Promise<void> {
        if (stopping) return;
        if (claiming.has(jobClass)) {
            claimAgain.add(jobClass);
            return;
        }
        claiming.add(jobClass);
        try {
            const types = typesByClass.get(jobClass) ?? [];
            for (;;) {
                const free = options.concurrency[jobClass] - activeIn(jobClass);
                if (stopping || free <= 0 || types.length === 0) break;
                const claimed = await claim(db, {
                    types,
                    limit: free,
                    workerId,
                    leaseMs: settings.leaseMs,
                });
                for (const job of claimed) startJob(job);
                if (claimed.length < free) break;
            }
        } catch (error) {
            reportError(error, "claim");
        } finally {
            claiming.delete(jobClass);
            if (claimAgain.delete(jobClass)) track(fill(jobClass));
        }
    }

    function wake() {
        for (const jobClass of options.classes) track(fill(jobClass));
    }

    function jobContext(job: JobRow, extra: Record<string, unknown> = {}) {
        return {
            job_id: job.id,
            job_type: job.type,
            media_id: job.mediaId ?? undefined,
            app_id: job.appId ?? undefined,
            attempts_made: job.attempts,
            worker_id: workerId,
            ...extra,
        };
    }

    function startJob(job: JobRow) {
        const definition = definitions.get(job.type)!;
        const controller = new AbortController();
        const entry = {
            job,
            controller,
            startedAt: Date.now(),
        } as Active;
        logger.debug(
            jobContext(job, {
                wait_ms: Math.max(
                    0,
                    Date.now() - new Date(job.runAt).getTime(),
                ),
            }),
            "job claimed",
        );
        entry.done = runJob(definition, entry).finally(() => {
            active.delete(job.id);
            track(fill(definition.class));
        });
        active.set(job.id, entry);
    }

    async function runJob(definition: JobDefinition, entry: Active) {
        const { job, controller } = entry;
        const timeout = definition.timeoutMs
            ? setTimeout(() => {
                  entry.abortedFor ??= "timeout";
                  controller.abort(new Error("job timed out"));
              }, definition.timeoutMs)
            : undefined;
        let result: unknown;
        let failure: unknown;
        try {
            result = await definition.handler(job.payload, {
                job,
                signal: controller.signal,
                workerId,
            });
        } catch (error) {
            failure = error;
        } finally {
            if (timeout) clearTimeout(timeout);
        }
        const duration_ms = Date.now() - entry.startedAt;

        if (entry.abortedFor === "lost") {
            logger.info(jobContext(job, { duration_ms }), "job cancelled");
            return;
        }
        if (entry.abortedFor === "shutdown") return;

        try {
            if (failure === undefined && entry.abortedFor !== "timeout") {
                const owned = await complete(db, {
                    id: job.id,
                    workerId,
                    result,
                });
                if (owned) {
                    logger.info(
                        jobContext(job, { duration_ms }),
                        "job succeeded",
                    );
                } else {
                    logger.info(
                        jobContext(job, { duration_ms }),
                        "job cancelled",
                    );
                }
                return;
            }

            const jobError =
                entry.abortedFor === "timeout"
                    ? new JobError("job timed out", {
                          reason: "timeout",
                          retryable: true,
                      })
                    : failure instanceof JobError
                      ? failure
                      : undefined;
            const reason: FailedReason = jobError?.reason ?? "internal";
            const retryable = jobError?.retryable ?? true;
            const message = describeError(jobError ?? failure);
            const retryInMs = retryDelayMs(
                job.attempts,
                random,
                settings.retryBaseMs,
                settings.retryMaxMs,
            );
            const outcome = await fail(db, {
                id: job.id,
                workerId,
                error: message,
                retryable,
                retryInMs,
                result: jobError?.result,
            });
            if (outcome === "retry") {
                logger.warn(
                    jobContext(job, {
                        duration_ms,
                        failed_reason: reason,
                        next_run_in_ms: retryInMs,
                    }),
                    "job will retry",
                );
            } else if (outcome === "failed") {
                logger.error(
                    jobContext(job, {
                        duration_ms,
                        failed_reason: reason,
                        error: message,
                    }),
                    "job failed",
                );
                options.onJobFailed?.({ job, reason, error: message });
            } else {
                logger.info(jobContext(job, { duration_ms }), "job cancelled");
            }
        } catch (error) {
            // The lease runs out and the reaper retries the job.
            reportError(error, "finish");
        }
    }

    async function beat() {
        if (active.size === 0) return;
        try {
            // An aborted job's lease is left to run out, so a handler that
            // ignores its signal is reaped instead of holding the job forever.
            const ids = [...active.values()]
                .filter((entry) => !entry.abortedFor)
                .map((entry) => entry.job.id);
            const owned = await heartbeat(db, {
                workerId,
                ids,
                leaseMs: settings.leaseMs,
            });
            for (const id of ids) {
                const entry = active.get(id);
                if (entry && !owned.has(id) && !entry.abortedFor) {
                    entry.abortedFor = "lost";
                    entry.controller.abort(new Error("job cancelled"));
                }
            }
        } catch (error) {
            reportError(error, "heartbeat");
        }
    }

    async function maintainOnce() {
        try {
            await recordWorker(db, { id: workerId, classes: options.classes });
        } catch (error) {
            reportError(error, "worker_heartbeat");
        }
        try {
            const reaped = await reap(db);
            if (reaped.length > 0) {
                for (const job of reaped) {
                    logger.warn(
                        {
                            job_id: job.id,
                            job_type: job.type,
                            media_id: job.mediaId ?? undefined,
                            app_id: job.appId ?? undefined,
                            attempts_made: job.attempts,
                            worker_id: job.lockedBy ?? undefined,
                            status: job.status,
                        },
                        "job reaped",
                    );
                }
                options.onReaped?.(reaped);
                wake();
            }
        } catch (error) {
            reportError(error, "reap");
        }
        for (const job of periodic) {
            try {
                if (await schedulePeriodic(db, job)) wake();
            } catch (error) {
                reportError(error, "schedule");
            }
        }
    }

    function maintain(): Promise<void> {
        maintaining ??= maintainOnce().finally(() => {
            maintaining = undefined;
        });
        return maintaining;
    }

    return {
        async start() {
            stopping = false;
            await recordWorker(db, { id: workerId, classes: options.classes });
            if (options.listen) {
                try {
                    unlisten = await options.listen(wake);
                } catch (error) {
                    // Polling still finds jobs.
                    reportError(error, "listen");
                }
            }
            timers.push(setInterval(wake, settings.pollMs));
            timers.push(setInterval(() => track(beat()), settings.heartbeatMs));
            timers.push(
                setInterval(() => void maintain(), settings.maintenanceMs),
            );
            for (const timer of timers) timer.unref?.();
            await maintain();
            wake();
        },

        async stop(graceMs: number) {
            stopping = true;
            for (const timer of timers.splice(0)) clearInterval(timer);
            if (unlisten) {
                await unlisten().catch((error) =>
                    reportError(error, "unlisten"),
                );
                unlisten = undefined;
            }
            await maintaining;
            await Promise.all(inflight);
            const finished = Promise.all(
                [...active.values()].map((entry) => entry.done),
            );
            let timer: NodeJS.Timeout | undefined;
            await Promise.race([
                finished,
                new Promise((resolve) => {
                    timer = setTimeout(resolve, graceMs);
                }),
            ]);
            clearTimeout(timer);
            const remaining = [...active.values()];
            if (remaining.length > 0) {
                for (const entry of remaining) {
                    entry.abortedFor ??= "shutdown";
                    entry.controller.abort(new Error("worker shutting down"));
                }
                try {
                    const released = await release(db, {
                        workerId,
                        ids: remaining.map((entry) => entry.job.id),
                    });
                    logger.info(
                        { worker_id: workerId, count: released },
                        "released running jobs",
                    );
                } catch (error) {
                    // Their leases run out and another worker takes them.
                    reportError(error, "release");
                }
            }
            try {
                await removeWorker(db, workerId);
            } catch (error) {
                reportError(error, "worker_remove");
            }
        },

        wake,
        activeCount: () => active.size,
        maintain,
    };
}
