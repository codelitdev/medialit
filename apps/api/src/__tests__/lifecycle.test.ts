import { test } from "node:test";
import assert from "node:assert/strict";
import { apiReadiness, createApiShutdown } from "../lifecycle.js";

function recordingSteps(calls: string[]) {
    return {
        stopBackgroundJobs: () => {
            calls.push("jobs");
        },
        closeMcpSessions: async () => {
            calls.push("mcp");
        },
        closeServer: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            calls.push("server");
        },
        closeDatabase: async () => {
            calls.push("database");
        },
        flushObservability: async () => {
            calls.push("observability");
        },
    };
}

test("shutdown closes the database only after the server drains", async () => {
    const calls: string[] = [];
    const shutdown = createApiShutdown(recordingSteps(calls));
    assert.equal(shutdown.shuttingDown(), false);
    await shutdown.shutdown();
    assert.equal(shutdown.shuttingDown(), true);
    assert.deepEqual(calls, [
        "jobs",
        "mcp",
        "server",
        "database",
        "observability",
    ]);
});

test("repeated signals run shutdown once", async () => {
    const calls: string[] = [];
    const shutdown = createApiShutdown(recordingSteps(calls));
    await Promise.all([shutdown.shutdown(), shutdown.shutdown()]);
    assert.equal(calls.filter((call) => call === "server").length, 1);
});

test("shutdown rejects when a step hangs past the timeout", async () => {
    const steps = {
        ...recordingSteps([]),
        closeServer: () => new Promise<void>(() => {}),
    };
    await assert.rejects(
        createApiShutdown(steps, 20).shutdown(),
        /shutdown_timeout/,
    );
});

test("readiness requires startup, no shutdown, and a reachable database", async () => {
    const ping = async () => undefined;
    assert.equal(
        (
            await apiReadiness({
                started: true,
                shuttingDown: false,
                pingDatabase: ping,
            })
        ).status,
        "ready",
    );

    let pinged = false;
    const notStarted = await apiReadiness({
        started: false,
        shuttingDown: false,
        pingDatabase: async () => {
            pinged = true;
        },
    });
    assert.equal(notStarted.status, "not_ready");
    assert.equal(pinged, false);

    const draining = await apiReadiness({
        started: true,
        shuttingDown: true,
        pingDatabase: ping,
    });
    assert.deepEqual(draining.checks, {
        started: true,
        accepting_requests: false,
        database: false,
    });

    const databaseDown = await apiReadiness({
        started: true,
        shuttingDown: false,
        pingDatabase: async () => {
            throw new Error("connection refused");
        },
    });
    assert.equal(databaseDown.status, "not_ready");
    assert.equal(databaseDown.checks.database, false);
});
