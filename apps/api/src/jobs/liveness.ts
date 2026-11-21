import { describeError } from "./errors";
import { liveWorkerClasses, type Executor } from "./queue";
import { JOB_CLASSES } from "./runner";

/** A worker not seen for this long counts as gone. */
export const WORKER_SEEN_WITHIN_MS = 5 * 60 * 1000;

type Logger = {
    warn: (context: Record<string, unknown>, message: string) => void;
};

/** The job classes no live worker serves. */
export async function missingWorkerClasses(db: Executor): Promise<string[]> {
    const live = await liveWorkerClasses(db, WORKER_SEEN_WITHIN_MS);
    return JOB_CLASSES.filter((jobClass) => !live.has(jobClass));
}

/**
 * Warns when no worker runs some class of jobs: without one, uploads are
 * never cleaned up. Checks shortly after startup, giving a worker started
 * at the same time a chance to report, then every hour.
 */
export function startWorkerLivenessCheck(input: {
    db: Executor;
    logger: Logger;
    firstCheckMs?: number;
    everyMs?: number;
}): () => void {
    const check = async () => {
        try {
            const missing = await missingWorkerClasses(input.db);
            if (missing.length > 0) {
                input.logger.warn(
                    { classes: missing.join(",") },
                    "No MediaLit worker is running, so uploads are not cleaned up. Start the medialit-worker service (bun apps/api/src/worker.ts).",
                );
            }
        } catch (error) {
            input.logger.warn(
                { error: describeError(error) },
                "Could not check for running workers",
            );
        }
    };
    const first = setTimeout(check, input.firstCheckMs ?? 60_000);
    const hourly = setInterval(check, input.everyMs ?? 60 * 60 * 1000);
    first.unref?.();
    hourly.unref?.();
    return () => {
        clearTimeout(first);
        clearInterval(hourly);
    };
}
