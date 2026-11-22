/**
 * Derivatives: outputs made from a sealed media item's original, such as
 * posters, HLS and captions (pipelines-phase-0.md, D6, D7 and section 6).
 *
 * Workers write derivatives to the private bucket. A derivative job ends in
 * one transaction that records the output, locks the media row, settles the
 * media's processing status and queues what follows (publishing, webhooks).
 * `media.publish` copies ready derivatives that must be public to the public
 * bucket.
 */
import { Constants, type PathKey } from "@medialit/models";
import { sql } from "drizzle-orm";
import {
    getDb,
    listDerivatives,
    lockMedia,
    markDerivativesPublic,
    publicKeyOf,
    markThumbnailPublic,
    needsPublicCopy,
    orphanedDerivatives,
    settleMedia,
    totalMediaSize,
    unpublishedDerivatives,
    upsertDerivative,
    type DerivativeRecord,
    type Executor,
    type LockedMedia,
    type SettledStatus,
} from "@/db";
import {
    ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT,
    CDN_ENDPOINT,
    CLOUD_ENDPOINT_PUBLIC,
    PATH_PREFIX,
    cloudBucket,
    cloudPublicBucket,
} from "../config/constants";
import {
    copyObject,
    deleteFolder,
    deleteObject,
    generateCloudfrontSignedUrl,
    generateSignedUrl,
    listKeys,
} from "../services/s3";
import { resolveAccountPlan, storageLimitFor } from "../billing/entitlements";
import { enqueue } from "../jobs/queue";
import { JobError, describeError, permanentError } from "../jobs/errors";
import type { JobClass, JobContext, JobDefinition } from "../jobs/runner";
import logger from "../services/log";
import { trackEvent } from "../services/events";
import { releaseOrphanedMinutes } from "../billing/processing-minutes";
import type { PlannedJob } from "./processing-plan";
import { playlistUrl } from "./playback";
import { mediaKind } from "./kind";

export const MEDIA_PUBLISH_JOB = "media.publish";
export const PROCESSING_RECONCILE_JOB = "media.processing_reconcile";
const MEDIA_PUBLISH_ATTEMPTS = 5;

function prefix(): string {
    return PATH_PREFIX ? `${PATH_PREFIX}/` : "";
}

/** A media item's folder in one bucket, ending in `/`. */
export function mediaFolder(mediaId: string, path: PathKey): string {
    return `${prefix()}${path}/${mediaId}/`;
}

function bucketFor(bucket: DerivativeRecord["bucket"]) {
    return bucket === "public"
        ? { name: cloudPublicBucket, path: Constants.PathKey.PUBLIC }
        : { name: cloudBucket, path: Constants.PathKey.PRIVATE };
}

/** The full object key of a derivative's file, or of its prefix. */
export function derivativeObjectKey(
    mediaId: string,
    bucket: DerivativeRecord["bucket"],
    key: string,
): string {
    return `${mediaFolder(mediaId, bucketFor(bucket).path)}${key}`;
}

/** Every object key a derivative stored: its file, or each file under its
 * prefix. */
async function derivativeObjects(
    mediaId: string,
    bucket: DerivativeRecord["bucket"],
    key: string,
): Promise<string[]> {
    const full = derivativeObjectKey(mediaId, bucket, key);
    return key.endsWith("/")
        ? await listKeys(full, bucketFor(bucket).name)
        : [full];
}

async function deleteDerivativeObjects(
    mediaId: string,
    bucket: DerivativeRecord["bucket"],
    key: string,
): Promise<void> {
    const full = derivativeObjectKey(mediaId, bucket, key);
    if (key.endsWith("/")) {
        await deleteFolder(full, bucketFor(bucket).name);
    } else {
        await deleteObject({ Key: full, Bucket: bucketFor(bucket).name });
    }
}

/** Removes everything stored for a media item, in both buckets, including
 * derivatives and files of seals that didn't finish. */
export async function deleteMediaFolders(mediaId: string): Promise<void> {
    await deleteFolder(
        mediaFolder(mediaId, Constants.PathKey.PRIVATE),
        cloudBucket,
    );
    await deleteFolder(
        mediaFolder(mediaId, Constants.PathKey.PUBLIC),
        cloudPublicBucket,
    );
}

// --- The media response ---

export type DerivativeResponse = {
    status: DerivativeRecord["status"];
    url?: string;
    mimeType?: string;
    size?: number;
    error?: string;
};

/** The `derivatives` field of the media response. `url` is set only for
 * ready derivatives, signed for those in the private bucket. Outputs with
 * several files (a prefix) get no URL here; their manifests will. */
export async function derivativesResponse(
    mediaId: string,
    rows: DerivativeRecord[],
    options: { durationSeconds?: number } = {},
): Promise<Record<string, DerivativeResponse>> {
    const response: Record<string, DerivativeResponse> = {};
    for (const row of rows) {
        const item: DerivativeResponse = { status: row.status };
        if (row.status === "ready") {
            if (row.key && !row.key.endsWith("/")) {
                item.url = await derivativeUrl(mediaId, row.bucket, row.key);
            } else if (row.name === "hls" && row.key) {
                // HLS (phase 1, D6): public media plays its master playlist
                // straight from the CDN; private media through the API's
                // signed playlist routes.
                item.url =
                    row.bucket === "public"
                        ? `${CDN_ENDPOINT || CLOUD_ENDPOINT_PUBLIC}/${derivativeObjectKey(mediaId, "public", `${row.key}master.m3u8`)}`
                        : playlistUrl(mediaId, options.durationSeconds);
            }
            if (row.mimeType) item.mimeType = row.mimeType;
            item.size = row.size;
        }
        if (row.error) item.error = row.error;
        response[row.name] = item;
    }
    return response;
}

async function derivativeUrl(
    mediaId: string,
    bucket: DerivativeRecord["bucket"],
    key: string,
): Promise<string> {
    const objectKey = derivativeObjectKey(mediaId, bucket, key);
    if (bucket === "public") {
        return `${CDN_ENDPOINT || CLOUD_ENDPOINT_PUBLIC}/${objectKey}`;
    }
    return ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT
        ? generateCloudfrontSignedUrl(objectKey)
        : await generateSignedUrl(objectKey, cloudBucket);
}

// --- Settling ---

export type ProcessingSettledEvent = {
    media: LockedMedia;
    status: SettledStatus;
    error: string | null;
    derivatives: DerivativeRecord[];
};

type SettledHook = (
    db: Executor,
    event: ProcessingSettledEvent,
) => Promise<void>;

const settledHooks: SettledHook[] = [];

/** Runs in the transaction that settles a media item's processing status,
 * so what it queues (webhook deliveries) commits with the status change. */
export function onProcessingSettled(hook: SettledHook): () => void {
    settledHooks.push(hook);
    return () => {
        const index = settledHooks.indexOf(hook);
        if (index >= 0) settledHooks.splice(index, 1);
    };
}

/** Returns the event when the media settled, so the caller can report it
 * once the transaction commits. */
async function settle(
    db: Executor,
    media: LockedMedia,
): Promise<ProcessingSettledEvent | null> {
    const settled = await settleMedia(db, media);
    if (!settled) return null;
    const derivatives = await listDerivatives(db, media.id);
    const event = { media, ...settled, derivatives };
    for (const hook of settledHooks) {
        await hook(db, event);
    }
    return event;
}

/** Logs and sends what a committed finish did. */
function reportFinished(
    name: string,
    result:
        | { status: "ready"; size: number }
        | { status: "failed"; error: string },
    media: LockedMedia,
    settled: ProcessingSettledEvent | null,
): void {
    logger.info(
        {
            media_id: media.mediaId,
            app_id: media.appId,
            derivative: name,
            status: result.status,
            ...(result.status === "ready"
                ? { size_bytes: result.size }
                : { error: result.error }),
        },
        "derivative recorded",
    );
    if (!settled) return;
    const failed = settled.derivatives
        .filter((d) => d.status === "failed")
        .map((d) => d.name);
    logger.info(
        {
            media_id: media.mediaId,
            app_id: media.appId,
            status: settled.status,
            failed_derivatives: failed,
        },
        "processing settled",
    );
    trackEvent({
        event: "media.processing.settled",
        source: "media.derivatives",
        appId: media.appId,
        userId: media.userId,
        properties: {
            media_id: media.mediaId,
            media_kind: mediaKind(media.mimeType),
            status: settled.status,
            derivatives: settled.derivatives.map((d) => d.name),
            failed_derivatives: failed,
        },
    });
}

/**
 * Queues `media.publish` unless one is already queued for the media; that
 * one will see this derivative when it runs. A running one may already have
 * read its rows, so it doesn't count. The caller holds the media row lock,
 * so two callers can't both queue one.
 */
async function queuePublish(db: Executor, media: LockedMedia): Promise<void> {
    if ((await unpublishedDerivatives(db, media)).length === 0) return;
    const queued = await db.execute(
        sql`SELECT 1 FROM jobs WHERE media_id = ${media.id}
            AND type = ${MEDIA_PUBLISH_JOB} AND status = 'queued' LIMIT 1`,
    );
    if (queued.rows.length > 0) return;
    await enqueue(db, {
        type: MEDIA_PUBLISH_JOB,
        payload: {},
        mediaId: media.id,
        appId: media.appId,
        maxAttempts: MEDIA_PUBLISH_ATTEMPTS,
    });
}

/**
 * Runs in seal's commit transaction, after the row is sealed. Seal copied
 * the thumbnail itself; anything else ready that must be public is queued
 * for `media.publish`. Seal and finishing jobs both lock the media row, so
 * one of them always sees the other.
 */
export async function afterSealCommit(
    db: Executor,
    mediaRowId: string,
    planned: PlannedJob[] = [],
): Promise<void> {
    const media = await lockMedia(db, mediaRowId);
    if (!media) return;
    await markThumbnailPublic(db, mediaRowId);
    await queuePublish(db, media);
    // The jobs seal planned (phase 1, D11): a queued derivative row each,
    // with the settings copied into its params, and its job.
    for (const job of planned) {
        await upsertDerivative(db, {
            mediaRowId,
            name: job.derivative,
            status: "queued",
            size: 0,
            error: null,
            params: job.params,
        });
        await enqueue(db, {
            type: job.type,
            payload: { derivative: job.derivative, params: job.params },
            mediaId: mediaRowId,
            appId: media.appId,
            priority: job.priority,
            maxAttempts: job.maxAttempts,
        });
    }
}

export type DerivativeOutput = {
    /** Relative to the media's private folder: a file, or a prefix ending
     * in `/`. */
    key: string;
    mimeType?: string;
    size: number;
};

export type FinishOutcome = "recorded" | "media_gone" | "not_enough_storage";

/**
 * Records a derivative job's result in one transaction: locks the media row,
 * checks storage for a ready output, writes the derivative, queues
 * `media.publish` when the output must be public, and settles the media.
 * When the outcome isn't `recorded`, the caller deletes the output.
 */
export async function finishDerivative(input: {
    mediaRowId: string;
    name: string;
    result:
        | { status: "ready"; output: DerivativeOutput }
        | { status: "failed"; error: string };
}): Promise<FinishOutcome> {
    const { result } = input;
    const db = getDb();
    // Read before the transaction: the plan lookup uses the pool, and a
    // transaction waiting on a second connection can starve the pool.
    const owner = await lockMedia(db, input.mediaRowId, { lock: false });
    if (!owner) return "media_gone";
    const storageLimit =
        result.status === "ready"
            ? storageLimitFor(await resolveAccountPlan({ id: owner.userId }))
            : 0;
    let report: (() => void) | undefined;
    const outcome = await db.transaction(async (tx): Promise<FinishOutcome> => {
        const media = await lockMedia(tx, input.mediaRowId);
        if (!media) return "media_gone";

        if (result.status === "failed") {
            await upsertDerivative(tx, {
                mediaRowId: media.id,
                name: input.name,
                status: "failed",
                size: 0,
                error: result.error,
            });
            const settled = await settle(tx, media);
            report = () =>
                reportFinished(
                    input.name,
                    { status: "failed", error: result.error },
                    media,
                    settled,
                );
            return "recorded";
        }

        const existing = (await listDerivatives(tx, media.id)).find(
            (d) => d.name === input.name && d.status === "ready",
        );
        const total = await totalMediaSize({ userId: media.userId }, tx);
        const after = total - (existing?.size ?? 0) + result.output.size;
        if (after > storageLimit) {
            await upsertDerivative(tx, {
                mediaRowId: media.id,
                name: input.name,
                status: "failed",
                size: 0,
                error: "not_enough_storage",
            });
            const settled = await settle(tx, media);
            report = () =>
                reportFinished(
                    input.name,
                    { status: "failed", error: "not_enough_storage" },
                    media,
                    settled,
                );
            return "not_enough_storage";
        }

        await upsertDerivative(tx, {
            mediaRowId: media.id,
            name: input.name,
            status: "ready",
            key: result.output.key,
            mimeType: result.output.mimeType ?? null,
            size: result.output.size,
            error: null,
            bucket: "private",
        });
        if (needsPublicCopy(media, input.name)) {
            await queuePublish(tx, media);
        }
        const settled = await settle(tx, media);
        report = () =>
            reportFinished(
                input.name,
                { status: "ready", size: result.output.size },
                media,
                settled,
            );
        return "recorded";
    });
    // Only after the commit: a rolled-back finish reports nothing.
    report?.();
    return outcome;
}

/** Marks a derivative `processing` when its job starts. False when the
 * media is gone. */
async function startDerivative(
    mediaRowId: string,
    name: string,
): Promise<LockedMedia | null> {
    return await getDb().transaction(async (tx) => {
        const media = await lockMedia(tx, mediaRowId);
        if (!media) return null;
        await upsertDerivative(tx, {
            mediaRowId,
            name,
            status: "processing",
            size: 0,
            error: null,
        });
        return media;
    });
}

// --- Jobs ---

export type DerivativeJobPayload = {
    /** The derivative's name; also lets the reconciler match the job. */
    derivative: string;
    params?: Record<string, unknown>;
};

export type ProduceContext = {
    media: LockedMedia;
    /** The job being run: its ID keys processing minutes. */
    job: JobContext["job"];
    params: Record<string, unknown>;
    signal: AbortSignal;
    /** Where to write outputs: the media's private folder, ending in `/`. */
    privateFolder: string;
};

/**
 * A job that makes one derivative. `produce` writes its output under the
 * media's private folder and returns its key. Settling the media, storage
 * accounting and publishing are handled here.
 */
export function derivativeJob(definition: {
    type: string;
    name: string;
    class: JobClass;
    maxAttempts: number;
    timeoutMs?: number;
    produce: (context: ProduceContext) => Promise<DerivativeOutput>;
}): JobDefinition<DerivativeJobPayload> {
    return {
        type: definition.type,
        class: definition.class,
        maxAttempts: definition.maxAttempts,
        timeoutMs: definition.timeoutMs,
        handler: async (payload, context: JobContext) => {
            const mediaRowId = context.job.mediaId;
            if (!mediaRowId) {
                throw permanentError("Derivative job without a media item");
            }
            const media = await startDerivative(mediaRowId, definition.name);
            if (!media) return { skipped: "media_gone" };

            let output: DerivativeOutput;
            try {
                output = await definition.produce({
                    media,
                    job: context.job,
                    params: payload.params ?? {},
                    signal: context.signal,
                    privateFolder: mediaFolder(
                        media.mediaId,
                        Constants.PathKey.PRIVATE,
                    ),
                });
            } catch (err) {
                const retryable = !(err instanceof JobError) || err.retryable;
                const lastAttempt =
                    context.job.attempts >= context.job.maxAttempts;
                if (!retryable || lastAttempt) {
                    await finishDerivative({
                        mediaRowId,
                        name: definition.name,
                        result: { status: "failed", error: describeError(err) },
                    });
                }
                throw err;
            }

            const outcome = await finishDerivative({
                mediaRowId,
                name: definition.name,
                result: { status: "ready", output },
            });
            if (outcome !== "recorded") {
                await deleteDerivativeObjects(
                    media.mediaId,
                    "private",
                    output.key,
                );
            }
            if (outcome === "not_enough_storage") {
                throw permanentError(
                    "Not enough storage for the derivative",
                    "not_enough_storage",
                );
            }
            return { outcome };
        },
    };
}

/** Copies a derivative's files from the private to the public bucket. */
async function copyToPublic(
    mediaId: string,
    row: DerivativeRecord,
): Promise<void> {
    const sources = await derivativeObjects(mediaId, "private", row.key!);
    const privateFolderKey = mediaFolder(mediaId, Constants.PathKey.PRIVATE);
    // A file published under another name (the poster, as thumb.webp).
    const renamed = row.key!.endsWith("/") ? null : publicKeyOf(row);
    for (const source of sources) {
        const relative = renamed ?? source.slice(privateFolderKey.length);
        await copyObject({
            sourceKey: source,
            sourceBucket: cloudBucket,
            destinationKey: `${mediaFolder(mediaId, Constants.PathKey.PUBLIC)}${relative}`,
            destinationBucket: cloudPublicBucket,
            ContentType: row.key!.endsWith("/")
                ? undefined
                : (row.mimeType ?? undefined),
        });
    }
}

/**
 * Copies a media item's ready derivatives that must be public to the public
 * bucket, then records them as public and deletes the private copies.
 * Idempotent: a retry copies again what didn't flip.
 */
export async function publishDerivatives(mediaRowId: string): Promise<{
    published: number;
}> {
    const db = getDb();
    const startedAt = Date.now();
    const media = await lockMedia(db, mediaRowId, { lock: false });
    if (!media) return { published: 0 };
    const pending = await unpublishedDerivatives(db, media);
    if (pending.length === 0) return { published: 0 };

    const copied: DerivativeRecord[] = [];
    for (const row of pending) {
        try {
            await copyToPublic(media.mediaId, row);
        } catch (err) {
            // Another publisher may have published it and deleted the
            // private copy meanwhile. Only a row still waiting is an error.
            const still = await unpublishedDerivatives(db, media);
            if (still.some((r) => r.id === row.id && r.key === row.key)) {
                throw err;
            }
            continue;
        }
        copied.push(row);
    }

    const flipped = await db.transaction(async (tx) => {
        const locked = await lockMedia(tx, mediaRowId);
        if (!locked) return null;
        return await markDerivativesPublic(tx, copied);
    });
    if (flipped === null) {
        // Deleted meanwhile: its delete may have run before these copies.
        await deleteFolder(
            mediaFolder(media.mediaId, Constants.PathKey.PUBLIC),
            cloudPublicBucket,
        );
        return { published: 0 };
    }
    for (const row of copied) {
        if (flipped.includes(row.id)) {
            await deleteDerivativeObjects(media.mediaId, "private", row.key!);
        }
    }
    logger.info(
        {
            media_id: media.mediaId,
            app_id: media.appId,
            count: flipped.length,
            duration_ms: Date.now() - startedAt,
        },
        "derivatives published",
    );
    return { published: flipped.length };
}

/** How long a derivative may sit `queued` or `processing` with no live job
 * before the reconciler fails it. */
export const ORPHAN_AFTER_MS = 10 * 60 * 1000;

/**
 * Fails derivatives whose job is gone without recording a result: a worker
 * died on the last attempt, or the job was cancelled. Settles their media.
 */
export async function reconcileProcessing(
    olderThanMs = ORPHAN_AFTER_MS,
): Promise<{ failed: number }> {
    const orphans = await orphanedDerivatives(getDb(), olderThanMs);
    for (const row of orphans) {
        // An encode whose worker died on its last attempt still holds the
        // minutes it reserved; nothing was made, so give them back.
        await releaseOrphanedMinutes(getDb(), row.mediaRowId, row.name);
        await finishDerivative({
            mediaRowId: row.mediaRowId,
            name: row.name,
            result: { status: "failed", error: "processing stopped" },
        });
    }
    if (orphans.length > 0) {
        logger.warn(
            { count: orphans.length },
            "Failed derivatives whose jobs stopped",
        );
    }
    return { failed: orphans.length };
}

export const derivativeJobDefinitions: JobDefinition[] = [
    {
        type: MEDIA_PUBLISH_JOB,
        class: "io",
        maxAttempts: MEDIA_PUBLISH_ATTEMPTS,
        timeoutMs: 30 * 60 * 1000,
        handler: async (_payload, context) => {
            if (!context.job.mediaId) return { published: 0 };
            return await publishDerivatives(context.job.mediaId);
        },
    },
    {
        type: PROCESSING_RECONCILE_JOB,
        class: "io",
        maxAttempts: 1,
        timeoutMs: 10 * 60 * 1000,
        handler: async () => await reconcileProcessing(),
    },
];
