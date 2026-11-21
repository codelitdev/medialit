import pg from "pg";
import { JOBS_CHANNEL } from "./queue";

/**
 * Listens for job notifications on a connection of its own (a pooled
 * connection would lose the LISTEN when it goes back to the pool), and
 * reconnects after a failure. Polling covers the gap while it is down.
 */
export function pgListener(
    connectionString: string,
    options: {
        onError: (error: unknown) => void;
        reconnectMs?: number;
    },
) {
    return async (onNotify: () => void) => {
        let client: pg.Client | undefined;
        let closed = false;
        let retry: NodeJS.Timeout | undefined;

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
            lost.end().catch(() => undefined);
            reconnectLater();
        };

        const connect = async () => {
            const next = new pg.Client({ connectionString });
            next.on("notification", (message) => {
                if (message.channel === JOBS_CHANNEL) onNotify();
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
            // Jobs queued while it was down.
            onNotify();
        };

        await connect();

        return async () => {
            closed = true;
            if (retry) clearTimeout(retry);
            const current = client;
            client = undefined;
            await current?.end();
        };
    };
}
