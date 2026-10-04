import {
    bigint,
    boolean,
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
    customerId: text("customer_id").unique(),
    subscriptionId: text("subscription_id").unique(),
    subscriptionEndsAfter: timestamp("subscription_ends_after", {
        withTimezone: true,
    }),
    subscriptionMethod: text("subscription_method"),
    subscriptionStatus: text("subscription_status")
        .notNull()
        .default("not-subscribed"),
});

export const apiKeys = pgTable(
    "api_keys",
    {
        id: text("id").primaryKey(),
        keyId: text("key_id").notNull().unique(),
        name: text("name").notNull(),
        key: text("key").notNull().unique(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        restriction: text("restriction"),
        httpReferrers: text("http_referrers")
            .array()
            .notNull()
            .default(sql`'{}'::text[]`),
        ipAddresses: text("ip_addresses")
            .array()
            .notNull()
            .default(sql`'{}'::text[]`),
        deleted: boolean("deleted").notNull().default(false),
        isDefault: boolean("is_default").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => ({
        userName: uniqueIndex("api_keys_user_name_uidx")
            .on(table.userId, table.name)
            .where(sql`${table.deleted} = false`),
        oneDefault: uniqueIndex("api_keys_one_default_uidx")
            .on(table.userId)
            .where(sql`${table.isDefault} = true AND ${table.deleted} = false`),
    }),
);

export const media = pgTable("media", {
    id: text("id").primaryKey(),
    fileName: text("file_name").notNull(),
    mediaId: text("media_id").notNull().unique(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    apikey: text("apikey").notNull(),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    thumbnailGenerated: boolean("thumbnail_generated").notNull().default(false),
    accessControl: text("access_control").notNull().default("private"),
    group: text("group_name"),
    caption: text("caption"),
    temp: boolean("temp").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const mediaSettings = pgTable("media_settings", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    apikey: text("apikey").notNull().unique(),
    useWebP: boolean("use_web_p"),
    webpOutputQuality: bigint("webp_output_quality", { mode: "number" }),
    thumbnailWidth: bigint("thumbnail_width", { mode: "number" }),
    thumbnailHeight: bigint("thumbnail_height", { mode: "number" }),
});

export const signatures = pgTable("signatures", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    apikey: text("apikey").notNull(),
    signature: text("signature").notNull().unique(),
    validTill: timestamp("valid_till", { withTimezone: true }).notNull(),
    group: text("group_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const tusUploads = pgTable("tus_uploads", {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull().unique(),
    userId: text("user_id").notNull(),
    apikey: text("apikey").notNull(),
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
    apiKeyId: text("api_key_id")
        .notNull()
        .references(() => apiKeys.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
});
