/**
 * The job types the worker runs. The cleanup jobs used to run on timers in
 * every API replica; as periodic jobs they run once per cluster.
 */
import { getDb } from "@/db";
import { cleanupTUSUploads } from "../tus/cleanup";
import {
    cleanupExpiredTempUploads,
    cleanupStaleUploads,
} from "../media/cleanup";
import {
    PROCESSING_RECONCILE_JOB,
    derivativeJobDefinitions,
} from "../media/derivatives";
import { prune } from "./queue";
import { posterJob } from "../media/poster";
import { registerWebhookHooks, webhookDeliverJob } from "../webhooks/delivery";
import type { JobDefinition, PeriodicJob } from "./runner";

const HOUR_MS = 60 * 60 * 1000;

// Settling happens in derivative jobs, so the worker queues webhooks.
registerWebhookHooks();

/** Periodic jobs run once; the next scheduled run tries again. */
const PERIODIC_ATTEMPTS = 1;

export const jobDefinitions: JobDefinition[] = [
    {
        type: "uploads.tus_cleanup",
        class: "io",
        maxAttempts: PERIODIC_ATTEMPTS,
        timeoutMs: HOUR_MS,
        handler: async () => {
            await cleanupTUSUploads();
        },
    },
    {
        type: "media.temp_cleanup",
        class: "io",
        maxAttempts: PERIODIC_ATTEMPTS,
        timeoutMs: HOUR_MS,
        handler: async () => {
            await cleanupExpiredTempUploads();
        },
    },
    {
        type: "media.stale_upload_cleanup",
        class: "io",
        maxAttempts: PERIODIC_ATTEMPTS,
        timeoutMs: HOUR_MS,
        handler: async () => {
            await cleanupStaleUploads();
        },
    },
    {
        type: "jobs.prune",
        class: "io",
        maxAttempts: PERIODIC_ATTEMPTS,
        timeoutMs: 10 * 60 * 1000,
        handler: async () => prune(getDb()),
    },
    ...derivativeJobDefinitions,
    posterJob,
    webhookDeliverJob(),
];

export const periodicJobs: PeriodicJob[] = [
    { type: "uploads.tus_cleanup", everyMs: HOUR_MS },
    { type: "media.temp_cleanup", everyMs: HOUR_MS },
    // Uploads the server lost mid-way (a crash) release their reserved
    // storage within UPLOAD_STALE_MINUTES plus this interval.
    { type: "media.stale_upload_cleanup", everyMs: 15 * 60 * 1000 },
    { type: "jobs.prune", everyMs: HOUR_MS },
    // Settles media whose derivative jobs stopped without a result.
    { type: PROCESSING_RECONCILE_JOB, everyMs: 5 * 60 * 1000 },
];
