import {
    bigint,
    boolean,
    check,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { MediaMetadata, ProcessingStatus } from "@medialit/models";
import { session, user } from "./auth.generated";

export type { MediaMetadata, ProcessingStatus };

export const profiles = pgTable("profiles", {
    userId: text("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
    publicUserId: text("public_user_id").notNull().unique(),
    active: boolean("active").notNull().default(true),
});

/**
 * An app is a tenant: every media record, setting, signature and upload belongs
 * to one. `id` is internal and every foreign key references it. `app_id` is the
 * public ID used in URLs, the dashboard API and the OAuth `app_id` claim.
 */
export const apps = pgTable(
    "apps",
    {
        id: text("id").primaryKey(),
        appId: text("app_id").notNull().unique(),
        name: text("name").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        deleted: boolean("deleted").notNull().default(false),
        isDefault: boolean("is_default").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => ({
        userName: uniqueIndex("apps_user_name_uidx")
            .on(table.userId, table.name)
            .where(sql`${table.deleted} = false`),
        oneDefault: uniqueIndex("apps_one_default_uidx")
            .on(table.userId)
            .where(sql`${table.isDefault} = true AND ${table.deleted} = false`),
    }),
);

export const API_KEY_CREATED_BY_TYPES = [
    "user",
    "bootstrap",
    "legacy",
] as const;
export type ApiKeyCreatedByType = (typeof API_KEY_CREATED_BY_TYPES)[number];

/**
 * An app's API keys. Only a SHA-256 hash of the secret is stored; the secret
 * itself is shown once, when the key is created. `api_key_id` is the public ID.
 */
export const apiKeys = pgTable(
    "api_keys",
    {
        id: text("id").primaryKey(),
        apiKeyId: text("api_key_id").notNull().unique(),
        appId: text("app_id")
            .notNull()
            .references(() => apps.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        keyHash: text("key_hash").notNull().unique(),
        keyPrefix: text("key_prefix").notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
        revokedAt: timestamp("revoked_at", { withTimezone: true }),
        createdByType: text("created_by_type")
            .$type<ApiKeyCreatedByType>()
            .notNull(),
        createdById: text("created_by_id").references(() => user.id, {
            onDelete: "set null",
        }),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        appIdx: index("api_keys_app_id_idx").on(table.appId),
        createdByTypeCheck: check(
            "api_keys_created_by_type_check",
            sql`${table.createdByType} IN ('user', 'bootstrap', 'legacy')`,
        ),
    }),
);

export type DerivativeStatus = "queued" | "processing" | "ready" | "failed";

export const media = pgTable(
    "media",
    {
        id: text("id").primaryKey(),
        fileName: text("file_name").notNull(),
        mediaId: text("media_id").notNull().unique(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        appId: text("app_id")
            .notNull()
            .references(() => apps.id, { onDelete: "cascade" }),
        originalFileName: text("original_file_name").notNull(),
        mimeType: text("mime_type").notNull(),
        size: bigint("size", { mode: "number" }).notNull(),
        thumbnailGenerated: boolean("thumbnail_generated")
            .notNull()
            .default(false),
        accessControl: text("access_control").notNull().default("private"),
        group: text("group_name"),
        caption: text("caption"),
        temp: boolean("temp").notNull().default(true),
        /** False while the file is still uploading. The row is written when
         * an upload starts, so the temp cleanup job can remove what a crash
         * leaves behind. */
        uploaded: boolean("uploaded").notNull().default(true),
        /** `pending` until seal, then `processing` while derivative jobs run,
         * then `ready` or `failed`. Rows from before processing existed are
         * `ready`. */
        processingStatus: text("processing_status")
            .$type<ProcessingStatus>()
            .notNull()
            .default("ready"),
        processingError: text("processing_error"),
        /** Duration, size, codecs and format, read at seal
         * (pipelines-phase-1.md, D2). Null until then, or when it couldn't
         * be read. */
        metadata: jsonb("metadata").$type<MediaMetadata>(),
        /** The token of the seal that holds this media, and when its claim
         * expires. Set only while a seal is converting and copying. */
        sealClaim: text("seal_claim"),
        sealingUntil: timestamp("sealing_until", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => ({
        processingStatusCheck: check(
            "media_processing_status_check",
            sql`${table.processingStatus} IN ('pending', 'processing', 'ready', 'failed')`,
        ),
        owner: index("media_owner_idx").on(
            table.userId,
            table.appId,
            table.temp,
        ),
    }),
);

export const mediaSettings = pgTable("media_settings", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    appId: text("app_id")
        .notNull()
        .unique()
        .references(() => apps.id, { onDelete: "cascade" }),
    useWebP: boolean("use_web_p"),
    webpOutputQuality: bigint("webp_output_quality", { mode: "number" }),
    /** No longer read or written: thumbnails have one size for every app.
     * Kept so the previous release still works after a rollback; drop them
     * in a later migration. */
    thumbnailWidth: bigint("thumbnail_width", { mode: "number" }),
    thumbnailHeight: bigint("thumbnail_height", { mode: "number" }),
    /** `off`, `hls` or `mp4`, chosen per app; null (never chosen) means
     * `off` (pipelines-phase-1.md, D1). */
    videoStreaming: text("video_streaming").$type<VideoStreaming>(),
    /** Renditions to make for HLS; null means the default ladder. */
    hlsRenditions: text("hls_renditions").array(),
});

export type VideoStreaming = "off" | "hls" | "mp4";

/**
 * Processing minutes an account used (pipelines-phase-1.md, D8). One row per
 * encode, keyed by its job so a retry doesn't charge twice. Deleting media
 * keeps its rows: the minutes were spent.
 */
export const processingUsage = pgTable(
    "processing_usage",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        mediaId: text("media_id").references(() => media.id, {
            onDelete: "set null",
        }),
        jobId: text("job_id").notNull().unique(),
        kind: text("kind").notNull(),
        minutes: integer("minutes").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        userCreated: index("processing_usage_user_created_idx").on(
            table.userId,
            table.createdAt,
        ),
    }),
);

export const signatures = pgTable(
    "signatures",
    {
        id: text("id").primaryKey(),
        userId: text("user_id").notNull(),
        appId: text("app_id")
            .notNull()
            .references(() => apps.id, { onDelete: "cascade" }),
        /** The key that minted it; null when minted through OAuth or the
         * dashboard. Revoking the key deletes its signatures. */
        apiKeyId: text("api_key_id").references(() => apiKeys.id, {
            onDelete: "cascade",
        }),
        signature: text("signature").notNull().unique(),
        validTill: timestamp("valid_till", { withTimezone: true }).notNull(),
        group: text("group_name"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    },
    (table) => ({
        apiKeyIdx: index("signatures_api_key_id_idx").on(table.apiKeyId),
    }),
);

export const tusUploads = pgTable("tus_uploads", {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull().unique(),
    userId: text("user_id").notNull(),
    appId: text("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    /** The media ID the upload will create, chosen when it starts. */
    mediaId: text("media_id"),
    uploadLength: bigint("upload_length", { mode: "number" }).notNull(),
    metadata: jsonb("metadata").notNull(),
    signature: text("signature"),
    isComplete: boolean("is_complete").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * The app an OAuth end-user picked on `/oauth/select-app`, keyed by their
 * Better Auth session. `oauthProvider`'s `postLogin.consentReferenceId` hook
 * reads it back so the app ends up on the access token's `app_id` claim, which
 * scopes MCP and REST requests made with that token to the app.
 */
export const oauthAppSelections = pgTable("oauth_app_selections", {
    sessionId: text("session_id")
        .primaryKey()
        .references(() => session.id, { onDelete: "cascade" }),
    appId: text("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
});

export const JOB_STATUSES = [
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * The job queue (docs/prds/pipelines-phase-0.md, D1). Workers claim rows with
 * `FOR UPDATE SKIP LOCKED` and hold a lease (`locked_until`) that they renew
 * while the job runs. Deleting the media or app deletes its jobs, and the
 * worker running one aborts it at its next heartbeat.
 */
export const jobs = pgTable(
    "jobs",
    {
        id: text("id").primaryKey(),
        type: text("type").notNull(),
        payload: jsonb("payload").notNull(),
        mediaId: text("media_id").references(() => media.id, {
            onDelete: "cascade",
        }),
        appId: text("app_id").references(() => apps.id, {
            onDelete: "cascade",
        }),
        status: text("status").$type<JobStatus>().notNull(),
        priority: integer("priority").notNull().default(100),
        runAt: timestamp("run_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
        attempts: integer("attempts").notNull().default(0),
        maxAttempts: integer("max_attempts").notNull(),
        lockedBy: text("locked_by"),
        lockedUntil: timestamp("locked_until", { withTimezone: true }),
        lastError: text("last_error"),
        result: jsonb("result"),
        /** At most one queued or running job has a given key. */
        dedupeKey: text("dedupe_key"),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
        startedAt: timestamp("started_at", { withTimezone: true }),
        finishedAt: timestamp("finished_at", { withTimezone: true }),
    },
    (table) => ({
        statusCheck: check(
            "jobs_status_check",
            sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
        ),
        claimable: index("jobs_claim_idx")
            .on(table.type, table.status, table.priority, table.runAt)
            .where(sql`${table.status} = 'queued'`),
        expiredLeases: index("jobs_running_lease_idx")
            .on(table.lockedUntil)
            .where(sql`${table.status} = 'running'`),
        finished: index("jobs_finished_idx")
            .on(table.status, table.finishedAt)
            .where(sql`${table.finishedAt} IS NOT NULL`),
        media: index("jobs_media_idx").on(table.mediaId),
        app: index("jobs_app_idx").on(table.appId),
        dedupe: uniqueIndex("jobs_dedupe_key_uidx")
            .on(table.dedupeKey)
            .where(sql`${table.status} IN ('queued', 'running')`),
    }),
);

/** One row per running worker process, updated while it runs. */
export const workers = pgTable("workers", {
    id: text("id").primaryKey(),
    classes: text("classes").array().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

/**
 * When each operator alert last paged (pipelines-phase-0.md, section 9).
 * Shared by every API replica and worker, so an alert pages at most once
 * per cooldown however many processes check it.
 */
export const operatorAlerts = pgTable("operator_alerts", {
    code: text("code").primaryKey(),
    lastPagedAt: timestamp("last_paged_at", { withTimezone: true }).notNull(),
});

/** An output made from a media item's original: `thumbnail` now; `poster`,
 * `hls`, `mp4` and `captions` later. One row per media item and name. */
export const derivatives = pgTable(
    "derivatives",
    {
        id: text("id").primaryKey(),
        mediaId: text("media_id")
            .notNull()
            .references(() => media.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        status: text("status").$type<DerivativeStatus>().notNull(),
        bucket: text("bucket")
            .$type<"private" | "public">()
            .notNull()
            .default("private"),
        /** A file, or a prefix ending in `/` for outputs with several files. */
        key: text("key"),
        mimeType: text("mime_type"),
        size: bigint("size", { mode: "number" }).notNull().default(0),
        /** The settings copied at seal, so a retried job uses them. */
        params: jsonb("params").notNull().default({}),
        error: text("error"),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
        completedAt: timestamp("completed_at", { withTimezone: true }),
    },
    (table) => ({
        statusCheck: check(
            "derivatives_status_check",
            sql`${table.status} IN ('queued', 'processing', 'ready', 'failed')`,
        ),
        bucketCheck: check(
            "derivatives_bucket_check",
            sql`${table.bucket} IN ('private', 'public')`,
        ),
        mediaName: uniqueIndex("derivatives_media_name_uidx").on(
            table.mediaId,
            table.name,
        ),
    }),
);

/**
 * Where an app's processing events are sent (pipelines-phase-0.md, D8). The
 * secret is stored as plain text so the dashboard can show it again; it
 * signs every delivery (Standard Webhooks). Apps are soft-deleted, so
 * `softDeleteApp` deletes these rows itself.
 */
export const webhookEndpoints = pgTable(
    "webhook_endpoints",
    {
        id: text("id").primaryKey(),
        appId: text("app_id")
            .notNull()
            .references(() => apps.id, { onDelete: "cascade" }),
        url: text("url").notNull(),
        secret: text("secret").notNull(),
        enabled: boolean("enabled").notNull().default(true),
        events: text("events").array().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        app: index("webhook_endpoints_app_idx").on(table.appId),
    }),
);
