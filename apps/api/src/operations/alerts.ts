/**
 * Paging operators, as SendLit's billing alerts do. A page writes an error log line, sends an `operations.page`
 * event, raises a critical exception and emails OPERATOR_ALERT_EMAIL.
 */
import { sql } from "drizzle-orm";
import type { Executor } from "../jobs/queue";
import { SYSTEM_SUBJECT, type CaptureException } from "../jobs/telemetry";

export type AlertCode =
    | "jobs_queue_lag"
    | "video_queue_lag"
    | "jobs_failure_spike"
    | "jobs_no_worker"
    | "webp_busy";

export type Alert = {
    code: AlertCode;
    message: string;
    details: Record<string, string | number>;
};

/** Each alert code waits this long before paging again. */
export const PAGE_COOLDOWN_MS = 30 * 60 * 1000;

export type PageDeps = {
    db: Executor;
    logger: {
        error: (context: Record<string, unknown>, message: string) => void;
        warn: (context: Record<string, unknown>, message: string) => void;
    };
    captureException: CaptureException;
    captureEvent: (input: {
        event: string;
        source: string;
        subjectId?: unknown;
        properties?: Record<string, unknown>;
    }) => void;
    email: (to: string[], subject: string, text: string) => Promise<void>;
    recipients: () => string[];
};

/**
 * Records that `code` pages now, unless it paged within the cooldown. The
 * row is shared, so API replicas and workers never page the same code twice
 * in one cooldown.
 */
export async function claimPage(db: Executor, code: string): Promise<boolean> {
    const result = await db.execute(
        sql`INSERT INTO operator_alerts (code, last_paged_at) VALUES (${code}, now())
            ON CONFLICT (code) DO UPDATE SET last_paged_at = now()
            WHERE operator_alerts.last_paged_at <= now() - (${PAGE_COOLDOWN_MS} * interval '1 millisecond')
            RETURNING code`,
    );
    return result.rows.length > 0;
}

/** Pages for `alert`. Returns false when the code is still cooling down. */
export async function pageAlert(
    alert: Alert,
    deps: PageDeps,
): Promise<boolean> {
    if (!(await claimPage(deps.db, alert.code))) return false;
    const properties = { alert_code: alert.code, ...alert.details };
    deps.logger.error(properties, alert.message);
    deps.captureEvent({
        event: "operations.page",
        source: "operations.alerts",
        subjectId: SYSTEM_SUBJECT,
        properties,
    });
    deps.captureException({
        error: new Error(alert.message),
        source: "operations.alerts",
        subjectId: SYSTEM_SUBJECT,
        severity: "critical",
        context: properties,
    });
    try {
        await deps.email(
            deps.recipients(),
            `[MediaLit] ${alert.code}`,
            `${alert.message}\n\n${JSON.stringify(alert.details, null, 2)}\n\nRunbook: https://medialit.cloud/docs/self-hosting#operate-the-job-queue`,
        );
    } catch (error) {
        deps.logger.warn(
            {
                alert_code: alert.code,
                error: error instanceof Error ? error.message : String(error),
            },
            "Operator email failed",
        );
    }
    return true;
}

/**
 * Runs `check` every minute and pages for what it finds. A failed check is
 * logged and tried again on the next tick.
 */
export function startAlertChecks(input: {
    check: () => Promise<Alert[]>;
    deps: PageDeps;
}): () => Promise<void> {
    let running: Promise<void> | undefined;
    const tick = () => {
        running ??= (async () => {
            try {
                for (const alert of await input.check()) {
                    await pageAlert(alert, input.deps);
                }
            } catch (error) {
                input.deps.logger.warn(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    "Alert checks failed",
                );
            }
        })().finally(() => {
            running = undefined;
        });
    };
    const every = setInterval(tick, 60_000);
    every.unref?.();
    return async () => {
        clearInterval(every);
        await running;
    };
}
