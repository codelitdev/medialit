import { availableParallelism, hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { JOB_CLASSES, type JobClass } from "./runner";

export type WorkerConfig = {
    port: number;
    classes: JobClass[];
    concurrency: Record<JobClass, number>;
    shutdownGraceMs: number;
};

function positiveInt(
    name: string,
    value: string | undefined,
    fallback: number,
) {
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive whole number`);
    }
    return parsed;
}

function nonNegativeInt(
    name: string,
    value: string | undefined,
    fallback: number,
) {
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${name} must be a whole number of at least 0`);
    }
    return parsed;
}

export function workerConfig(
    env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
    let classes: JobClass[] = [...JOB_CLASSES];
    if (env.WORKER_CLASSES && env.WORKER_CLASSES.trim() !== "") {
        const listed = env.WORKER_CLASSES.split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
        const unknown = listed.filter(
            (entry) => !(JOB_CLASSES as readonly string[]).includes(entry),
        );
        if (unknown.length > 0 || listed.length === 0) {
            throw new Error(
                `WORKER_CLASSES must list some of: ${JOB_CLASSES.join(", ")}`,
            );
        }
        classes = [...new Set(listed)] as JobClass[];
    }
    return {
        port: positiveInt("WORKER_PORT", env.WORKER_PORT, 8001),
        classes,
        concurrency: {
            cpu: positiveInt(
                "WORKER_CONCURRENCY_CPU",
                env.WORKER_CONCURRENCY_CPU,
                availableParallelism(),
            ),
            io: positiveInt(
                "WORKER_CONCURRENCY_IO",
                env.WORKER_CONCURRENCY_IO,
                16,
            ),
            // One encode at a time by default: ffmpeg uses every core.
            video: positiveInt(
                "WORKER_CONCURRENCY_VIDEO",
                env.WORKER_CONCURRENCY_VIDEO,
                1,
            ),
        },
        shutdownGraceMs: nonNegativeInt(
            "WORKER_SHUTDOWN_GRACE_MS",
            env.WORKER_SHUTDOWN_GRACE_MS,
            8_000,
        ),
    };
}

/** Unique per process: a restarted container keeps its hostname and PID, and
 * must not renew the leases its previous run held. */
export function newWorkerId(): string {
    return `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
}
