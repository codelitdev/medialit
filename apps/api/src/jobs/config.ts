import { availableParallelism, hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { DEFAULT_WORKER_CLASSES, JOB_CLASSES, type JobClass } from "./runner";
import { wholeNumberSetting } from "../config/env";

export type WorkerConfig = {
    port: number;
    classes: JobClass[];
    concurrency: Record<JobClass, number>;
    shutdownGraceMs: number;
};

export function workerConfig(
    env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
    let classes: JobClass[] = [...DEFAULT_WORKER_CLASSES];
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
        port: wholeNumberSetting(env, "WORKER_PORT", 8001),
        classes,
        concurrency: {
            cpu: wholeNumberSetting(
                env,
                "WORKER_CONCURRENCY_CPU",
                availableParallelism(),
            ),
            io: wholeNumberSetting(env, "WORKER_CONCURRENCY_IO", 16),
            // One encode at a time by default: ffmpeg uses every core.
            video: wholeNumberSetting(env, "WORKER_CONCURRENCY_VIDEO", 1),
            // One transcription at a time: it uses every core of its pod.
            transcribe: wholeNumberSetting(
                env,
                "WORKER_CONCURRENCY_TRANSCRIBE",
                1,
            ),
        },
        shutdownGraceMs: wholeNumberSetting(
            env,
            "WORKER_SHUTDOWN_GRACE_MS",
            8_000,
            0,
        ),
    };
}

/** Unique per process: a restarted container keeps its hostname and PID, and
 * must not renew the leases its previous run held. */
export function newWorkerId(): string {
    return `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
}
