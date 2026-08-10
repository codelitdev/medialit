import { getUniqueId } from "@medialit/utils";
import { sql } from "drizzle-orm";
import {
    bigint,
    boolean,
    integer,
    index,
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
    metadata: jsonb("metadata").$type<{
        fileName: string;
        mimeType: string;
        accessControl: string;
        caption?: string;
        group?: string;
    }>(),
    tempFilePath: text("temp_file_path"),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
});

// Better Auth keeps its identity and OAuth-provider state separate from
// MediaLit's domain users table. Existing MediaLit user IDs are copied into
// auth_users during the migration so OAuth subjects continue to resolve to the
// same application user and API keys.
export const authUsers = pgTable("auth_users", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const authSessions = pgTable(
    "auth_sessions",
    {
        id: text("id").primaryKey(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        token: text("token").notNull().unique(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        userId: text("user_id")
            .notNull()
            .references(() => authUsers.id, { onDelete: "cascade" }),
    },
    (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export const authAccounts = pgTable(
    "auth_accounts",
    {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => authUsers.id, { onDelete: "cascade" }),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at", {
            withTimezone: true,
        }),
        refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
            withTimezone: true,
        }),
        scope: text("scope"),
        password: text("password"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => [index("auth_accounts_user_id_idx").on(table.userId)],
);

export const authVerifications = pgTable(
    "auth_verifications",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => [
        index("auth_verifications_identifier_idx").on(table.identifier),
    ],
);

export const authJwks = pgTable("auth_jwks", {
    id: text("id").primaryKey(),
    publicKey: text("public_key").notNull(),
    privateKey: text("private_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    alg: text("alg"),
    crv: text("crv"),
});

export const oauthProviderClients = pgTable(
    "oauth_provider_clients",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id").notNull().unique(),
        clientSecret: text("client_secret"),
        disabled: boolean("disabled").default(false),
        skipConsent: boolean("skip_consent"),
        enableEndSession: boolean("enable_end_session"),
        subjectType: text("subject_type"),
        scopes: text("scopes").array(),
        userId: text("user_id").references(() => authUsers.id, {
            onDelete: "cascade",
        }),
        createdAt: timestamp("created_at", { withTimezone: true }),
        updatedAt: timestamp("updated_at", { withTimezone: true }),
        name: text("name"),
        uri: text("uri"),
        icon: text("icon"),
        contacts: text("contacts").array(),
        tos: text("tos"),
        policy: text("policy"),
        softwareId: text("software_id"),
        softwareVersion: text("software_version"),
        softwareStatement: text("software_statement"),
        redirectUris: text("redirect_uris").array().notNull(),
        postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
        tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
        grantTypes: text("grant_types").array(),
        responseTypes: text("response_types").array(),
        public: boolean("public"),
        type: text("type"),
        requirePKCE: boolean("require_pkce"),
        referenceId: text("reference_id"),
        metadata: jsonb("metadata"),
    },
    (table) => [index("oauth_provider_clients_user_id_idx").on(table.userId)],
);

export const oauthProviderRefreshTokens = pgTable(
    "oauth_provider_refresh_tokens",
    {
        id: text("id").primaryKey(),
        token: text("token").notNull().unique(),
        clientId: text("client_id")
            .notNull()
            .references(() => oauthProviderClients.clientId, {
                onDelete: "cascade",
            }),
        sessionId: text("session_id").references(() => authSessions.id, {
            onDelete: "set null",
        }),
        userId: text("user_id")
            .notNull()
            .references(() => authUsers.id, { onDelete: "cascade" }),
        referenceId: text("reference_id"),
        authorizationCodeId: text("authorization_code_id"),
        resources: text("resources").array(),
        requestedUserInfoClaims: text("requested_user_info_claims").array(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        revoked: timestamp("revoked", { withTimezone: true }),
        rotatedAt: timestamp("rotated_at", { withTimezone: true }),
        rotationReplayResponse: text("rotation_replay_response"),
        rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", {
            withTimezone: true,
        }),
        authTime: timestamp("auth_time", { withTimezone: true }),
        confirmation: jsonb("confirmation"),
        scopes: text("scopes").array().notNull(),
    },
    (table) => [
        index("oauth_provider_refresh_tokens_client_id_idx").on(table.clientId),
        index("oauth_provider_refresh_tokens_session_id_idx").on(
            table.sessionId,
        ),
        index("oauth_provider_refresh_tokens_user_id_idx").on(table.userId),
    ],
);

export const oauthProviderAccessTokens = pgTable(
    "oauth_provider_access_tokens",
    {
        id: text("id").primaryKey(),
        token: text("token").notNull().unique(),
        clientId: text("client_id")
            .notNull()
            .references(() => oauthProviderClients.clientId, {
                onDelete: "cascade",
            }),
        sessionId: text("session_id").references(() => authSessions.id, {
            onDelete: "set null",
        }),
        userId: text("user_id").references(() => authUsers.id, {
            onDelete: "cascade",
        }),
        referenceId: text("reference_id"),
        authorizationCodeId: text("authorization_code_id"),
        resources: text("resources").array(),
        requestedUserInfoClaims: text("requested_user_info_claims").array(),
        refreshId: text("refresh_id").references(
            () => oauthProviderRefreshTokens.id,
            { onDelete: "set null" },
        ),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        scopes: text("scopes").array().notNull(),
        confirmation: jsonb("confirmation"),
    },
    (table) => [
        index("oauth_provider_access_tokens_client_id_idx").on(table.clientId),
        index("oauth_provider_access_tokens_session_id_idx").on(
            table.sessionId,
        ),
        index("oauth_provider_access_tokens_user_id_idx").on(table.userId),
        index("oauth_provider_access_tokens_refresh_id_idx").on(
            table.refreshId,
        ),
    ],
);

export const oauthProviderConsents = pgTable(
    "oauth_provider_consents",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id")
            .notNull()
            .references(() => oauthProviderClients.clientId, {
                onDelete: "cascade",
            }),
        userId: text("user_id").references(() => authUsers.id, {
            onDelete: "cascade",
        }),
        referenceId: text("reference_id"),
        resources: text("resources").array(),
        requestedUserInfoClaims: text("requested_user_info_claims").array(),
        scopes: text("scopes").array().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => [
        index("oauth_provider_consents_client_id_idx").on(table.clientId),
        index("oauth_provider_consents_user_id_idx").on(table.userId),
    ],
);

export const oauthProviderClientAssertions = pgTable(
    "oauth_provider_client_assertions",
    {
        id: text("id").primaryKey(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    },
);
