import { liveWorkerClasses, type Executor } from "./queue";
import { JOB_CLASSES } from "./runner";

/** A worker not seen for this long counts as gone. Workers report every
 * 30 s and keep their row when they stop, so a restart doesn't count. */
export const WORKER_SEEN_WITHIN_MS = 5 * 60 * 1000;

/** The job classes no live worker serves. */
export async function missingWorkerClasses(db: Executor): Promise<string[]> {
    const live = await liveWorkerClasses(db, WORKER_SEEN_WITHIN_MS);
    return JOB_CLASSES.filter((jobClass) => !live.has(jobClass));
}
