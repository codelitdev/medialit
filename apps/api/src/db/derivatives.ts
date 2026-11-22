/**
 * Derivative rows and the media processing status (pipelines-phase-0.md, D6,
 * D7 and section 4). Every function takes the database or a transaction, so
 * the caller decides what commits together.
 */
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { AppDb } from "./client.js";
import type { DerivativeStatus, ProcessingStatus } from "./schema/index.js";

/** The database or a transaction. */
export type Executor = Pick<AppDb, "execute">;

export type DerivativeBucket = "private" | "public";

export type DerivativeRecord = {
    id: string;
    /** The media row's internal ID. */
    mediaRowId: string;
    name: string;
    status: DerivativeStatus;
    bucket: DerivativeBucket;
    /** Relative to the media's folder: a file, or a prefix ending in `/`. */
    key: string | null;
    mimeType: string | null;
    size: number;
    params: Record<string, unknown>;
    error: string | null;
};

/** The media row fields processing needs, read under a row lock. */
export type LockedMedia = {
    id: string;
    mediaId: string;
    userId: string;
    appId: string;
    temp: boolean;
    accessControl: "public" | "private";
    processingStatus: ProcessingStatus;
};

/** Derivatives that are public for every media item, as thumbnails are
 * today. Others are public only for public media. */
export const ALWAYS_PUBLIC_DERIVATIVES: readonly string[] = [
    "thumbnail",
    "poster",
];

export function needsPublicCopy(
    media: Pick<LockedMedia, "temp" | "accessControl">,
    name: string,
): boolean {
    if (media.temp) return false;
    return (
        media.accessControl === "public" ||
        ALWAYS_PUBLIC_DERIVATIVES.includes(name)
    );
}

const DERIVATIVE_COLUMNS = sql.raw(
    [
        "d.id",
        `d.media_id AS "mediaRowId"`,
        "d.name",
        "d.status",
        "d.bucket",
        "d.key",
        `d.mime_type AS "mimeType"`,
        "d.size::float8 AS size",
        "d.params",
        "d.error",
    ].join(", "),
);

async function rows<T>(db: Executor, query: SQL): Promise<T[]> {
    const result = await db.execute(query);
    return result.rows as T[];
}

function toDerivative(row: DerivativeRecord): DerivativeRecord {
    return { ...row, size: Number(row.size ?? 0) };
}

/** Every derivative of the given media items, by public media ID. */
export async function listDerivativesByMediaIds(
    db: Executor,
    mediaIds: string[],
): Promise<Map<string, DerivativeRecord[]>> {
    const byMedia = new Map<string, DerivativeRecord[]>();
    if (mediaIds.length === 0) return byMedia;
    const found = await rows<DerivativeRecord & { publicMediaId: string }>(
        db,
        sql`SELECT ${DERIVATIVE_COLUMNS}, m.media_id AS "publicMediaId"
            FROM derivatives d JOIN media m ON m.id = d.media_id
            WHERE m.media_id IN (${sql.join(
                mediaIds.map((id) => sql`${id}`),
                sql`, `,
            )})
            ORDER BY d.name`,
    );
    for (const { publicMediaId, ...row } of found) {
        const list = byMedia.get(publicMediaId) ?? [];
        list.push(toDerivative(row));
        byMedia.set(publicMediaId, list);
    }
    return byMedia;
}

export async function listDerivatives(
    db: Executor,
    mediaRowId: string,
): Promise<DerivativeRecord[]> {
    const found = await rows<DerivativeRecord>(
        db,
        sql`SELECT ${DERIVATIVE_COLUMNS} FROM derivatives d
            WHERE d.media_id = ${mediaRowId} ORDER BY d.name`,
    );
    return found.map(toDerivative);
}

/** Locks a media row for the rest of the transaction, or only reads it with
 * `lock: false`. Null when it's gone. */
export async function lockMedia(
    db: Executor,
    mediaRowId: string,
    options: { lock?: boolean } = {},
): Promise<LockedMedia | null> {
    const [row] = await rows<LockedMedia>(
        db,
        sql`SELECT id, media_id AS "mediaId", user_id AS "userId",
                app_id AS "appId", temp, access_control AS "accessControl",
                processing_status AS "processingStatus"
            FROM media WHERE id = ${mediaRowId}
            ${options.lock === false ? sql`` : sql`FOR UPDATE`}`,
    );
    return row ?? null;
}

export type DerivativeUpdate = {
    mediaRowId: string;
    name: string;
    status: DerivativeStatus;
    key?: string | null;
    mimeType?: string | null;
    size?: number;
    params?: Record<string, unknown>;
    error?: string | null;
    bucket?: DerivativeBucket;
};

/** Writes a derivative's row, creating it if needed. Returns the row. */
export async function upsertDerivative(
    db: Executor,
    input: DerivativeUpdate,
): Promise<DerivativeRecord> {
    const done = input.status === "ready" || input.status === "failed";
    const [row] = await rows<DerivativeRecord>(
        db,
        sql`INSERT INTO derivatives AS d
                (id, media_id, name, status, bucket, key, mime_type, size, params, error, completed_at)
            VALUES (${randomUUID()}, ${input.mediaRowId}, ${input.name}, ${input.status},
                ${input.bucket ?? "private"}, ${input.key ?? null}, ${input.mimeType ?? null},
                ${input.size ?? 0}, ${JSON.stringify(input.params ?? {})}::jsonb,
                ${input.error ?? null}, ${done ? sql`now()` : null})
            ON CONFLICT (media_id, name) DO UPDATE SET
                status = excluded.status,
                bucket = excluded.bucket,
                key = coalesce(excluded.key, d.key),
                mime_type = coalesce(excluded.mime_type, d.mime_type),
                size = excluded.size,
                params = CASE WHEN ${input.params === undefined}
                    THEN d.params ELSE excluded.params END,
                error = excluded.error,
                completed_at = excluded.completed_at,
                updated_at = now()
            RETURNING ${DERIVATIVE_COLUMNS}`,
    );
    return toDerivative(row);
}

/** The `thumbnail` derivative of a new upload, next to `thumbnailGenerated`.
 * It stays in the private bucket until seal copies it. */
export async function recordThumbnailDerivative(
    db: Executor,
    input: { mediaRowId: string; size: number },
): Promise<void> {
    await upsertDerivative(db, {
        mediaRowId: input.mediaRowId,
        name: "thumbnail",
        status: "ready",
        key: "thumb.webp",
        mimeType: "image/webp",
        size: input.size,
        bucket: "private",
    });
}

/** Records that seal copied the thumbnail to the public bucket. Runs in the
 * seal's commit transaction. */
export async function markThumbnailPublic(
    db: Executor,
    mediaRowId: string,
): Promise<void> {
    await db.execute(
        sql`UPDATE derivatives SET bucket = 'public', updated_at = now()
            WHERE media_id = ${mediaRowId} AND name = 'thumbnail'
            AND status = 'ready'`,
    );
}

/** Ready derivatives still in the private bucket that should be public. */
export async function unpublishedDerivatives(
    db: Executor,
    media: Pick<LockedMedia, "id" | "temp" | "accessControl">,
): Promise<DerivativeRecord[]> {
    if (media.temp) return [];
    const ready = await rows<DerivativeRecord>(
        db,
        sql`SELECT ${DERIVATIVE_COLUMNS} FROM derivatives d
            WHERE d.media_id = ${media.id} AND d.status = 'ready'
            AND d.bucket = 'private' AND d.key IS NOT NULL`,
    );
    return ready
        .map(toDerivative)
        .filter((row) => needsPublicCopy(media, row.name));
}

/** Flips derivatives to the public bucket, unless they changed since they
 * were copied. Returns the IDs that flipped. */
export async function markDerivativesPublic(
    db: Executor,
    copied: Pick<DerivativeRecord, "id" | "key">[],
): Promise<string[]> {
    const flipped: string[] = [];
    for (const row of copied) {
        const updated = await rows<{ id: string }>(
            db,
            sql`UPDATE derivatives SET bucket = 'public', updated_at = now()
                WHERE id = ${row.id} AND status = 'ready' AND bucket = 'private'
                AND key = ${row.key}
                RETURNING id`,
        );
        if (updated.length > 0) flipped.push(row.id);
    }
    return flipped;
}

export type SettledStatus = Extract<ProcessingStatus, "ready" | "failed">;

/**
 * Sets the media's final status once none of its derivatives is queued or
 * processing. Only media that is `processing` settles: seal answers for
 * work it finished inline. The caller holds the media row lock. Returns the
 * new status, or null when nothing changed.
 */
export async function settleMedia(
    db: Executor,
    media: LockedMedia,
): Promise<{ status: SettledStatus; error: string | null } | null> {
    if (media.temp || media.processingStatus !== "processing") return null;
    const all = await listDerivatives(db, media.id);
    if (all.some((d) => d.status === "queued" || d.status === "processing")) {
        return null;
    }
    const failed = all.filter((d) => d.status === "failed");
    const status: SettledStatus = failed.length > 0 ? "failed" : "ready";
    const error =
        failed.length > 0
            ? failed.map((d) => `${d.name}: ${d.error ?? "failed"}`).join("; ")
            : null;
    await db.execute(
        sql`UPDATE media SET processing_status = ${status},
                processing_error = ${error}, updated_at = now()
            WHERE id = ${media.id}`,
    );
    return { status, error };
}

/** Derivatives stuck in `queued` or `processing` whose job is no longer
 * queued or running: it failed for good, or was reaped on its last attempt. */
export async function orphanedDerivatives(
    db: Executor,
    olderThanMs: number,
): Promise<DerivativeRecord[]> {
    const found = await rows<DerivativeRecord>(
        db,
        sql`SELECT ${DERIVATIVE_COLUMNS} FROM derivatives d
            WHERE d.status IN ('queued', 'processing')
            AND d.updated_at < now() - (${Math.round(olderThanMs)} * interval '1 millisecond')
            AND NOT EXISTS (
                SELECT 1 FROM jobs j
                WHERE j.media_id = d.media_id
                AND j.status IN ('queued', 'running')
                AND j.payload->>'derivative' = d.name)
            LIMIT 500`,
    );
    return found.map(toDerivative);
}
