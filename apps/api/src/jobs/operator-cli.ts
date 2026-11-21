/**
 * `bun --filter @medialit/api jobs <command>` (pipelines-phase-0.md,
 * section 9). Reads and changes the job queue with DATABASE_URL; on the
 * cluster, run it with `kubectl exec` in the worker pod.
 */
import { sql, type SQL } from "drizzle-orm";
import { JOB_STATUSES } from "../db/schema/domain";
import { cancel, JOBS_CHANNEL, type Executor } from "./queue";
import { WORKER_SEEN_WITHIN_MS } from "./liveness";

export type JobsCliIo = {
    db: Executor;
    out: (line: string) => void;
    err: (line: string) => void;
};

export const JOBS_CLI_USAGE = `Usage:
  jobs stats
  jobs list [--status <status>] [--type <type>] [--since <age>] [--limit <n>]
  jobs show <jobId>
  jobs media <mediaId>
  jobs retry <jobId>
  jobs retry [--type <type>] [--status failed|cancelled] [--since <age>] [--yes]
  jobs cancel <jobId>
  jobs cancel [--type <type>] [--since <age>] [--yes]
  jobs workers

<age> is a number and a unit, such as 30m, 1h or 2d. Bulk retry and cancel
print how many jobs they would change, and change them only with --yes.`;

class UsageError extends Error {}

type Flags = {
    positional: string[];
    values: Map<string, string>;
    yes: boolean;
};

const VALUE_FLAGS = new Set(["--status", "--type", "--since", "--limit"]);

function parseFlags(argv: string[]): Flags {
    const flags: Flags = { positional: [], values: new Map(), yes: false };
    for (let index = 0; index < argv.length; index++) {
        const entry = argv[index];
        if (entry === "--yes") {
            flags.yes = true;
        } else if (VALUE_FLAGS.has(entry)) {
            const value = argv[++index];
            if (!value || value.startsWith("--")) {
                throw new UsageError(`${entry} needs a value`);
            }
            flags.values.set(entry, value);
        } else if (entry.startsWith("--")) {
            throw new UsageError(`Unknown option ${entry}`);
        } else {
            flags.positional.push(entry);
        }
    }
    return flags;
}

const UNITS: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000,
};

/** "30m", "1h", "2d" in milliseconds. */
export function parseAge(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) throw new UsageError(`Can't read the age "${value}"`);
    return Number(match[1]) * UNITS[match[2]];
}

export function formatAge(ms: number): string {
    if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
    if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
    if (ms < 48 * 60 * 60_000) return `${(ms / (60 * 60_000)).toFixed(1)}h`;
    return `${(ms / (24 * 60 * 60_000)).toFixed(1)}d`;
}

function status(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (!(JOB_STATUSES as readonly string[]).includes(value)) {
        throw new UsageError(
            `--status must be one of: ${JOB_STATUSES.join(", ")}`,
        );
    }
    return value;
}

function ms(value: number): SQL {
    return sql`(${Math.round(value)} * interval '1 millisecond')`;
}

async function rows<T>(db: Executor, query: SQL): Promise<T[]> {
    return (await db.execute(query)).rows as T[];
}

/** Rows as aligned columns. */
function table(
    headers: string[],
    body: Array<Array<string | number | null>>,
): string[] {
    const cells = [headers, ...body.map((row) => row.map((v) => `${v ?? ""}`))];
    const widths = headers.map((_, column) =>
        Math.max(...cells.map((row) => row[column].length)),
    );
    return cells.map((row) =>
        row
            .map((cell, column) => cell.padEnd(widths[column]))
            .join("  ")
            .trimEnd(),
    );
}

function shorten(text: string | null, max = 80): string {
    if (!text) return "";
    const line = text.replace(/\s+/g, " ");
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

type ListedJob = {
    id: string;
    type: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    ageMs: string | number;
    lastError: string | null;
};

const LISTED_COLUMNS = sql`id, type, status, attempts, max_attempts AS "maxAttempts",
    floor(extract(epoch FROM now() - created_at) * 1000) AS "ageMs",
    last_error AS "lastError"`;

function printJobs(io: JobsCliIo, jobs: ListedJob[]) {
    if (jobs.length === 0) {
        io.out("No jobs.");
        return;
    }
    for (const line of table(
        ["ID", "TYPE", "STATUS", "ATTEMPTS", "AGE", "ERROR"],
        jobs.map((job) => [
            job.id,
            job.type,
            job.status,
            `${job.attempts}/${job.maxAttempts}`,
            formatAge(Number(job.ageMs)),
            shorten(job.lastError),
        ]),
    )) {
        io.out(line);
    }
}

/** Filters shared by list and the bulk commands. */
function filters(flags: Flags, statuses?: readonly string[]): SQL {
    const conditions: SQL[] = [];
    const type = flags.values.get("--type");
    if (type) conditions.push(sql`type = ${type}`);
    const since = flags.values.get("--since");
    if (since)
        conditions.push(sql`created_at > now() - ${ms(parseAge(since))}`);
    if (statuses) {
        conditions.push(
            sql`status IN (${sql.join(
                statuses.map((value) => sql`${value}`),
                sql`, `,
            )})`,
        );
    }
    return conditions.length > 0 ? sql.join(conditions, sql` AND `) : sql`true`;
}

async function stats(io: JobsCliIo) {
    const counts = await rows<{ type: string; status: string; count: string }>(
        io.db,
        sql`SELECT type, status, count(*) AS count FROM jobs GROUP BY type, status ORDER BY type`,
    );
    const byType = new Map<string, Record<string, number>>();
    for (const row of counts) {
        const entry = byType.get(row.type) ?? {};
        entry[row.status] = Number(row.count);
        byType.set(row.type, entry);
    }
    if (byType.size === 0) {
        io.out("No jobs.");
    } else {
        for (const line of table(
            ["TYPE", ...JOB_STATUSES.map((value) => value.toUpperCase())],
            [...byType].map(([type, entry]) => [
                type,
                ...JOB_STATUSES.map((value) => entry[value] ?? 0),
            ]),
        )) {
            io.out(line);
        }
    }
    const [summary] = await rows<{
        oldestMs: string | null;
        failedLastHour: string;
        liveWorkers: string;
    }>(
        io.db,
        sql`SELECT
                (SELECT floor(extract(epoch FROM now() - min(run_at)) * 1000)
                    FROM jobs WHERE status = 'queued' AND run_at <= now()) AS "oldestMs",
                (SELECT count(*) FROM jobs WHERE status = 'failed'
                    AND finished_at > now() - interval '1 hour') AS "failedLastHour",
                (SELECT count(*) FROM workers
                    WHERE last_seen_at > now() - ${ms(WORKER_SEEN_WITHIN_MS)}) AS "liveWorkers"`,
    );
    io.out("");
    io.out(
        `Oldest queued job: ${
            summary.oldestMs === null
                ? "none waiting"
                : `waiting ${formatAge(Number(summary.oldestMs))}`
        }`,
    );
    io.out(`Failed in the last hour: ${Number(summary.failedLastHour)}`);
    io.out(`Live workers: ${Number(summary.liveWorkers)}`);
}

async function list(io: JobsCliIo, flags: Flags) {
    const wanted = status(flags.values.get("--status"));
    const limitValue = flags.values.get("--limit") ?? "50";
    const limit = Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new UsageError("--limit must be a positive whole number");
    }
    printJobs(
        io,
        await rows<ListedJob>(
            io.db,
            sql`SELECT ${LISTED_COLUMNS} FROM jobs
                WHERE ${filters(flags, wanted ? [wanted] : undefined)}
                ORDER BY created_at DESC LIMIT ${limit}`,
        ),
    );
}

async function show(io: JobsCliIo, id: string): Promise<number> {
    const [job] = await rows<Record<string, unknown>>(
        io.db,
        sql`SELECT * FROM jobs WHERE id = ${id}`,
    );
    if (!job) {
        io.err(`No job ${id}.`);
        return 1;
    }
    io.out(JSON.stringify(job, null, 2));
    return 0;
}

async function media(io: JobsCliIo, mediaId: string) {
    printJobs(
        io,
        await rows<ListedJob>(
            io.db,
            sql`SELECT ${LISTED_COLUMNS} FROM jobs WHERE media_id = ${mediaId}
                ORDER BY created_at`,
        ),
    );
}

const RETRYABLE = ["failed", "cancelled"] as const;

/**
 * The ids a retry would queue: the newest matching job per dedupe key,
 * skipping keys that already have a queued or running job.
 */
function retryCandidates(where: SQL): SQL {
    return sql`SELECT DISTINCT ON (coalesce(dedupe_key, id)) id FROM jobs candidate
        WHERE ${where}
        AND (dedupe_key IS NULL OR NOT EXISTS (
            SELECT 1 FROM jobs other
            WHERE other.dedupe_key = candidate.dedupe_key
            AND other.status IN ('queued', 'running')))
        ORDER BY coalesce(dedupe_key, id), created_at DESC`;
}

/** Queues the retry candidates again with their attempts reset. */
async function retryWhere(db: Executor, where: SQL): Promise<number> {
    const updated = await rows<{ id: string }>(
        db,
        sql`UPDATE jobs SET status = 'queued', attempts = 0, run_at = now(),
                started_at = NULL, finished_at = NULL, locked_by = NULL, locked_until = NULL
            WHERE id IN (${retryCandidates(where)})
            RETURNING id`,
    );
    if (updated.length > 0) {
        await db.execute(sql`SELECT pg_notify(${JOBS_CHANNEL}, 'retried')`);
    }
    return updated.length;
}

async function retry(io: JobsCliIo, flags: Flags): Promise<number> {
    const [id] = flags.positional;
    if (id) {
        const [job] = await rows<{ status: string }>(
            io.db,
            sql`SELECT status FROM jobs WHERE id = ${id}`,
        );
        if (!job) {
            io.err(`No job ${id}.`);
            return 1;
        }
        if (!(RETRYABLE as readonly string[]).includes(job.status)) {
            io.err(
                `Job ${id} is ${job.status}; only failed and cancelled jobs can be retried.`,
            );
            return 1;
        }
        const count = await retryWhere(io.db, sql`id = ${id}`);
        if (count === 0) {
            io.err(
                `Job ${id} was not queued: another job with its dedupe key is queued or running.`,
            );
            return 1;
        }
        io.out(`Queued job ${id} again.`);
        return 0;
    }
    const wanted = status(flags.values.get("--status")) ?? "failed";
    if (!(RETRYABLE as readonly string[]).includes(wanted)) {
        throw new UsageError(
            "retry takes --status failed or --status cancelled",
        );
    }
    const where = filters(flags, [wanted]);
    if (!flags.yes) {
        const [found] = await rows<{ count: string }>(
            io.db,
            sql`SELECT count(*) AS count FROM (${retryCandidates(where)}) AS candidates`,
        );
        io.out(
            `Would queue ${Number(found.count)} ${wanted} jobs again. Run again with --yes to do it.`,
        );
        return 0;
    }
    io.out(`Queued ${await retryWhere(io.db, where)} jobs again.`);
    return 0;
}

async function cancelCommand(io: JobsCliIo, flags: Flags): Promise<number> {
    const [id] = flags.positional;
    if (id) {
        if ((await cancel(io.db, { id })) === 0) {
            io.err(`Job ${id} is not queued or running.`);
            return 1;
        }
        io.out(`Cancelled job ${id}.`);
        return 0;
    }
    if (!flags.values.has("--type") && !flags.values.has("--since")) {
        throw new UsageError("Bulk cancel needs --type or --since");
    }
    const where = filters(flags, ["queued", "running"]);
    if (!flags.yes) {
        const [found] = await rows<{ count: string }>(
            io.db,
            sql`SELECT count(*) AS count FROM jobs WHERE ${where}`,
        );
        io.out(
            `Would cancel ${Number(found.count)} queued or running jobs. Run again with --yes to do it.`,
        );
        return 0;
    }
    const cancelled = await rows<{ id: string }>(
        io.db,
        sql`UPDATE jobs SET status = 'cancelled', finished_at = now(),
                locked_by = NULL, locked_until = NULL
            WHERE ${where} RETURNING id`,
    );
    io.out(`Cancelled ${cancelled.length} jobs.`);
    return 0;
}

async function workers(io: JobsCliIo) {
    const found = await rows<{
        id: string;
        classes: string[] | string;
        startedMs: string;
        seenMs: string;
    }>(
        io.db,
        sql`SELECT id, classes,
                floor(extract(epoch FROM now() - started_at) * 1000) AS "startedMs",
                floor(extract(epoch FROM now() - last_seen_at) * 1000) AS "seenMs"
            FROM workers ORDER BY last_seen_at DESC`,
    );
    if (found.length === 0) {
        io.out("No workers have reported in the last day.");
        return;
    }
    for (const line of table(
        ["ID", "CLASSES", "STARTED", "LAST SEEN", "LIVE"],
        found.map((worker) => [
            worker.id,
            Array.isArray(worker.classes)
                ? worker.classes.join(",")
                : worker.classes.replace(/[{}]/g, ""),
            `${formatAge(Number(worker.startedMs))} ago`,
            `${formatAge(Number(worker.seenMs))} ago`,
            Number(worker.seenMs) < WORKER_SEEN_WITHIN_MS ? "yes" : "no",
        ]),
    )) {
        io.out(line);
    }
}

/** Runs one command. Returns the exit code. */
export async function runJobsCli(
    argv: string[],
    io: JobsCliIo,
): Promise<number> {
    const [command, ...rest] = argv;
    try {
        const flags = parseFlags(rest);
        const needsId = (what: string) => {
            const [value] = flags.positional;
            if (!value) throw new UsageError(`${command} needs ${what}`);
            return value;
        };
        switch (command) {
            case "stats":
                await stats(io);
                return 0;
            case "list":
                await list(io, flags);
                return 0;
            case "show":
                return await show(io, needsId("a job ID"));
            case "media":
                await media(io, needsId("a media ID"));
                return 0;
            case "retry":
                return await retry(io, flags);
            case "cancel":
                return await cancelCommand(io, flags);
            case "workers":
                await workers(io);
                return 0;
            default:
                io.err(JOBS_CLI_USAGE);
                return command && command !== "help" ? 2 : 0;
        }
    } catch (error) {
        if (error instanceof UsageError) {
            io.err(error.message);
            io.err("");
            io.err(JOBS_CLI_USAGE);
            return 2;
        }
        throw error;
    }
}
