import { getUniqueId } from "@medialit/utils";
import { sql } from "drizzle-orm";
import {
    bigint,
    boolean,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
    createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    userId: text("user_id")
        .notNull()
        .unique()
        .$defaultFn(() => getUniqueId()),
    email: text("email").notNull().unique(),
    active: boolean("active").notNull().default(true),
    name: text("name"),
    customerId: text("customer_id").unique(),
    subscriptionId: text("subscription_id").unique(),
    subscriptionEndsAfter: timestamp("subscription_ends_after", {
        withTimezone: true,
    }),
    subscriptionMethod: text("subscription_method", {
        enum: ["stripe", "lemon"],
    }),
    subscriptionStatus: text("subscription_status", {
        enum: [
            "not-subscribed",
            "subscribed",
            "cancelled",
            "paused",
            "expired",
        ],
    })
        .notNull()
        .default("not-subscribed"),
    ...timestamps,
});

export const apikeys = pgTable(
    "apikeys",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => getUniqueId()),
        keyId: text("key_id")
            .notNull()
            .unique()
            .$defaultFn(() => getUniqueId()),
        name: text("name").notNull(),
        key: text("key").notNull().unique(),
        userId: text("user_id").notNull(),
        restriction: text("restriction", {
            enum: ["referrer", "ipaddress", "custom"],
        }),
        httpReferrers: text("http_referrers").array(),
        ipAddresses: text("ip_addresses").array(),
        deleted: boolean("deleted").notNull().default(false),
        default: boolean("default").notNull().default(false),
        ...timestamps,
    },
    (table) => [
        uniqueIndex("apikeys_name_user_id_idx").on(table.name, table.userId),
        uniqueIndex("apikeys_default_user_id_idx")
            .on(table.userId, table.default)
            .where(sql`${table.default} = true and ${table.deleted} = false`),
    ],
);

export const media = pgTable("media", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    fileName: text("file_name").notNull(),
    mediaId: text("media_id").notNull(),
    userId: text("user_id").notNull(),
    apikey: text("apikey").notNull(),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    thumbnailGenerated: boolean("thumbnail_generated").notNull().default(false),
    accessControl: text("access_control", { enum: ["private", "public"] })
        .notNull()
        .default("private"),
    group: text("group_name"),
    caption: text("caption"),
    temp: boolean("temp").default(true),
    ...timestamps,
});

export const mediaSettings = pgTable("media_settings", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    userId: text("user_id").notNull(),
    apikey: text("apikey").notNull().unique(),
    useWebP: boolean("use_webp"),
    webpOutputQuality: integer("webp_output_quality"),
    thumbnailWidth: integer("thumbnail_width"),
    thumbnailHeight: integer("thumbnail_height"),
});

export const tusUploads = pgTable("tus_uploads", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    uploadId: text("upload_id").notNull().unique(),
    userId: text("user_id").notNull(),
    apikey: text("apikey").notNull(),
    uploadLength: bigint("upload_length", { mode: "number" }).notNull(),
    uploadOffset: bigint("upload_offset", { mode: "number" })
        .notNull()
        .default(0),
    metadata: jsonb("metadata")
        .$type<{
            fileName: string;
            mimeType: string;
            accessControl: string;
            caption?: string;
            group?: string;
        }>()
        .notNull(),
    tempFilePath: text("temp_file_path").notNull(),
    isComplete: boolean("is_complete").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    signature: text("signature"),
    ...timestamps,
});

export const presignedUrls = pgTable("presigned_urls", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    userId: text("user_id").notNull(),
    apikey: text("apikey").notNull(),
    signature: text("signature").notNull(),
    validTill: timestamp("valid_till", { withTimezone: true }).notNull(),
    group: text("group_name"),
    ...timestamps,
});

export const oauthClients = pgTable("oauth_clients", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    clientId: text("client_id").notNull().unique(),
    clientIdIssuedAt: bigint("client_id_issued_at", {
        mode: "number",
    }).notNull(),
    redirectUris: text("redirect_uris").array().notNull(),
    grantTypes: text("grant_types").array().notNull(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method", {
        enum: ["none"],
    })
        .notNull()
        .default("none"),
    clientName: text("client_name"),
    scope: text("scope"),
    ...timestamps,
});

export const oauthPendingAuths = pgTable("oauth_pending_auths", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    pendingId: text("pending_id").notNull().unique(),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge"),
    codeChallengeMethod: text("code_challenge_method"),
    state: text("state"),
    scope: text("scope"),
    email: text("email"),
    otpHash: text("otp_hash"),
    otpExpires: timestamp("otp_expires", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").default(0),
    otpSentAt: timestamp("otp_sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
});

export const oauthRevokedTokens = pgTable("oauth_revoked_tokens", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    jti: text("jti").notNull().unique(),
    tokenType: text("token_type", { enum: ["refresh_token"] })
        .notNull()
        .default("refresh_token"),
    userId: text("user_id").notNull(),
    clientId: text("client_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    ...timestamps,
});

export const plans = pgTable("plans", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    maxFileSize: bigint("max_file_size", { mode: "number" }).notNull(),
    maxStorage: bigint("max_storage", { mode: "number" }).notNull(),
    ...timestamps,
});

export const logs = pgTable("logs", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => getUniqueId()),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
});
