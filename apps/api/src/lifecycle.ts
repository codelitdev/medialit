import {
    createGracefulShutdown,
    type GracefulShutdown,
    type ReadinessReport,
    readinessReport,
} from "@codelitdev/platform";

/** Stays under Docker's default 10s stop grace period. */
export const SHUTDOWN_TIMEOUT_MS = 8_000;

export type ShutdownSteps = {
    /** Stops timers that start new work (cleanup jobs, billing batches). */
    stopBackgroundJobs: () => void;
    /** Ends open MCP streams, which would otherwise keep the server open. */
    closeMcpSessions: () => Promise<void>;
    /** Stops accepting connections and waits for in-flight requests. */
    closeServer: () => Promise<void>;
    closeDatabase: () => Promise<void>;
    flushObservability: () => Promise<void>;
};

/**
 * The kernel runs hooks concurrently, so the ordered steps share one hook:
 * the database must outlive in-flight requests, and logs flush last.
 */
export function createApiShutdown(
    steps: ShutdownSteps,
    timeoutMs = SHUTDOWN_TIMEOUT_MS,
): GracefulShutdown {
    return createGracefulShutdown({
        timeoutMs,
        hooks: [
            async () => {
                steps.stopBackgroundJobs();
                await steps.closeMcpSessions();
                await steps.closeServer();
                await steps.closeDatabase();
                await steps.flushObservability();
            },
        ],
    });
}

/**
 * Not ready until startup completes, and again once shutdown starts, so a
 * load balancer stops routing before connections close.
 */
export async function apiReadiness(input: {
    started: boolean;
    shuttingDown: boolean;
    pingDatabase: () => Promise<unknown>;
}): Promise<ReadinessReport> {
    const accepting = input.started && !input.shuttingDown;
    let database = false;
    if (accepting) {
        try {
            await input.pingDatabase();
            database = true;
        } catch {
            database = false;
        }
    }
    return readinessReport([
        { name: "started", ready: input.started },
        { name: "accepting_requests", ready: !input.shuttingDown },
        { name: "database", ready: database },
    ]);
}
