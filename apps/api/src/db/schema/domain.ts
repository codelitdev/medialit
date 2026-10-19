import {
    bigint,
    boolean,
    check,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { session, user } from "./auth.generated";

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
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => ({
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
    thumbnailWidth: bigint("thumbnail_width", { mode: "number" }),
    thumbnailHeight: bigint("thumbnail_height", { mode: "number" }),
});

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
    uploadLength: bigint("upload_length", { mode: "number" }).notNull(),
    uploadOffset: bigint("upload_offset", { mode: "number" })
        .notNull()
        .default(0),
    metadata: jsonb("metadata").notNull(),
    tempFilePath: text("temp_file_path"),
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
