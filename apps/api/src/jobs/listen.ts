import pg from "pg";
import { JOBS_CHANNEL } from "./queue";

export type PgListener = {
    /** Subscribes to job notifications; returns a function that closes the
     * connection. Fits `RunnerOptions.listen`. */
    listen: (onNotify: () => void) => Promise<() => Promise<void>>;
    /**
     * Takes the Postgres advisory lock named `name` on this connection, or
     * reports that it still holds it. Session locks belong to one
     * connection, so they can't go through the pool. The lock is lost when
     * the connection drops, and taken again on the next call after it
     * reconnects.
     */
    holdsLock: (name: string) => Promise<boolean>;
};

/**
 * One dedicated connection per worker: it listens for job notifications (a
 * pooled connection would lose the LISTEN when it goes back to the pool)
 * and holds advisory locks. It reconnects after a failure. Polling covers
 * the gap while it is down.
 */
export function pgListener(
    connectionString: string,
    options: {
        onError: (error: unknown) => void;
        reconnectMs?: number;
    },
): PgListener {
    let client: pg.Client | undefined;
    let closed = false;
    let retry: NodeJS.Timeout | undefined;
    let notify: () => void = () => undefined;
    /** Locks held by the current `client`. */
    let held = new Set<string>();

    const reconnectLater = () => {
        if (closed || retry) return;
        retry = setTimeout(() => {
            retry = undefined;
            connect().catch((error) => {
                options.onError(error);
                reconnectLater();
            });
        }, options.reconnectMs ?? 5_000);
        retry.unref?.();
    };

    const drop = (lost: pg.Client) => {
        if (client !== lost) return;
        client = undefined;
        held = new Set();
        lost.end().catch(() => undefined);
        reconnectLater();
    };

    const connect = async () => {
        const next = new pg.Client({ connectionString });
        next.on("notification", (message) => {
            if (message.channel === JOBS_CHANNEL) notify();
        });
        next.on("error", (error) => {
            options.onError(error);
            drop(next);
        });
        next.on("end", () => drop(next));
        try {
            await next.connect();
            await next.query(`LISTEN ${JOBS_CHANNEL}`);
        } catch (error) {
            next.end().catch(() => undefined);
            throw error;
        }
        if (closed) {
            await next.end();
            return;
        }
        client = next;
        held = new Set();
        // Jobs queued while it was down.
        notify();
    };

    return {
        async listen(onNotify) {
            notify = onNotify;
            await connect();
            return async () => {
                closed = true;
                if (retry) clearTimeout(retry);
                const current = client;
                client = undefined;
                held = new Set();
                await current?.end();
            };
        },

        async holdsLock(name) {
            const current = client;
            if (!current) return false;
            if (held.has(name)) return true;
            try {
                const result = await current.query<{ locked: boolean }>(
                    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
                    [name],
                );
                const locked = result.rows[0]?.locked === true;
                // The connection may have dropped while the query ran.
                if (locked && client === current) held.add(name);
                return locked && client === current;
            } catch (error) {
                options.onError(error);
                return false;
            }
        },
    };
}
