import { randomUUID } from "node:crypto";
import { getUniqueId } from "@medialit/utils";
import {
    and,
    asc,
    count,
    desc,
    eq,
    gt,
    ilike,
    inArray,
    isNull,
    like,
    lt,
    ne,
    or,
    sql,
    type SQL,
} from "drizzle-orm";
import { getDb } from "./client.js";
import {
    apiKeys,
    apps,
    media,
    mediaSettings,
    oauthAppSelections,
    oauthClient,
    profiles,
    signatures,
    tusUploads,
    user,
    type ApiKeyCreatedByType,
} from "./schema/index.js";

const SIGNATURE_LENGTH = 100;
const SIGNATURE_VALIDITY_MINUTES = Number(
    process.env.SIGNATURE_VALIDITY_MINUTES || "1440",
);

export type AccountUser = {
    id: string;
    _id: string;
    userId: string;
    email: string;
    active: boolean;
    name?: string;
};

/** An app: the tenant that media, settings, signatures and uploads belong
 * to. `id` is internal; `appId` is the public ID. */
export type AppRecord = {
    id: string;
    appId: string;
    name: string;
    userId: string;
    default: boolean;
    deleted: boolean;
    createdAt: Date;
    updatedAt: Date;
};

/** An API key. `id` is internal, `apiKeyId` is the public ID, and `appId` is
 * the internal ID of the app it belongs to. The secret is never stored. */
export type ApiKeyRecord = {
    id: string;
    apiKeyId: string;
    appId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    expiresAt?: Date;
    lastUsedAt?: Date;
    revokedAt?: Date;
    createdByType: ApiKeyCreatedByType;
    createdById?: string;
    createdAt: Date;
};

/** What authenticating with an API key resolves to. */
export type ApiKeyAuthRecord = {
    key: ApiKeyRecord;
    app: AppRecord;
    ownerActive: boolean;
};

export class ApiKeyLimitError extends Error {
    constructor(readonly limit: number) {
        super(`An app can have at most ${limit} active API keys`);
        this.name = "ApiKeyLimitError";
    }
}

export type MediaRecord = {
    id: string;
    _id: string;
    fileName: string;
    mediaId: string;
    userId: string;
    /** Internal ID of the app the media belongs to. */
    appId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    thumbnailGenerated: boolean;
    accessControl: "public" | "private";
    group?: string;
    caption?: string;
    temp: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type AppMediaSummary = {
    /** Internal app ID. */
    appId: string;
    count: number;
    storage: number;
    images: number;
    videos: number;
    pdfs: number;
    others: number;
    imageStorage: number;
    videoStorage: number;
    pdfStorage: number;
    otherStorage: number;
    lastUpload: Date | null;
};

export type MediaSettingsRecord = {
    userId: string;
    appId: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
};

export type SignatureRecord = {
    id: string;
    userId: string;
    appId: string;
    /** The key that minted it, if it was minted with an API key. */
    apiKeyId?: string;
    signature: string;
    validTill: Date;
    group?: string;
};

/** A signature that is still usable: its app exists and its key, if any, is
 * not revoked. `ownerActive` lets callers reject deactivated accounts. */
export type ActiveSignatureRecord = SignatureRecord & { ownerActive: boolean };

export type TusMetadata = {
    fileName: string;
    mimeType: string;
    accessControl: string;
    caption?: string;
    group?: string;
};

export type TusUploadRecord = {
    id: string;
    _id: string;
    uploadId: string;
    userId: string;
    appId: string;
    uploadLength: number;
    uploadOffset: number;
    metadata: TusMetadata;
    tempFilePath?: string;
    signature?: string;
    isComplete: boolean;
    expiresAt?: Date;
    createdAt: Date;
};

function now() {
    return new Date();
}

function mapUser(
    account: typeof user.$inferSelect,
    profile: typeof profiles.$inferSelect,
): AccountUser {
    return {
        id: account.id,
        _id: account.id,
        userId: profile.publicUserId,
        email: account.email,
        active: profile.active,
        name: account.name || undefined,
    };
}

function mapApp(row: typeof apps.$inferSelect): AppRecord {
    return {
        id: row.id,
        appId: row.appId,
        name: row.name,
        userId: row.userId,
        default: row.isDefault,
        deleted: row.deleted,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapApiKey(row: typeof apiKeys.$inferSelect): ApiKeyRecord {
    return {
        id: row.id,
        apiKeyId: row.apiKeyId,
        appId: row.appId,
        name: row.name,
        keyHash: row.keyHash,
        keyPrefix: row.keyPrefix,
        expiresAt: row.expiresAt ?? undefined,
        lastUsedAt: row.lastUsedAt ?? undefined,
        revokedAt: row.revokedAt ?? undefined,
        createdByType: row.createdByType,
        createdById: row.createdById ?? undefined,
        createdAt: row.createdAt,
    };
}

function mapMedia(row: typeof media.$inferSelect): MediaRecord {
    return {
        id: row.id,
        _id: row.id,
        fileName: row.fileName,
        mediaId: row.mediaId,
        userId: row.userId,
        appId: row.appId,
        originalFileName: row.originalFileName,
        mimeType: row.mimeType,
        size: row.size,
        thumbnailGenerated: row.thumbnailGenerated,
        accessControl: row.accessControl === "public" ? "public" : "private",
        group: row.group || undefined,
        caption: row.caption || undefined,
        temp: row.temp,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export async function findUserById(id: string): Promise<AccountUser | null> {
    const db = getDb();
    const rows = await db
        .select({ account: user, profile: profiles })
        .from(user)
        .innerJoin(profiles, eq(profiles.userId, user.id))
        .where(eq(user.id, id))
        .limit(1);
    const byPublic = rows[0]
        ? rows
        : await db
              .select({ account: user, profile: profiles })
              .from(user)
              .innerJoin(profiles, eq(profiles.userId, user.id))
              .where(eq(profiles.publicUserId, id))
              .limit(1);
    const row = byPublic[0];
    return row ? mapUser(row.account, row.profile) : null;
}

export async function findUserByEmail(
    email: string,
): Promise<AccountUser | null> {
    const db = getDb();
    const rows = await db
        .select({ account: user, profile: profiles })
        .from(user)
        .innerJoin(profiles, eq(profiles.userId, user.id))
        .where(eq(user.email, email.toLowerCase()))
        .limit(1);
    const row = rows[0];
    return row ? mapUser(row.account, row.profile) : null;
}

export async function findUserByPublicId(
    publicUserId: string,
): Promise<AccountUser | null> {
    const db = getDb();
    const rows = await db
        .select({ account: user, profile: profiles })
        .from(user)
        .innerJoin(profiles, eq(profiles.userId, user.id))
        .where(eq(profiles.publicUserId, publicUserId))
        .limit(1);
    const row = rows[0];
    return row ? mapUser(row.account, row.profile) : null;
}

export async function insertAuthUser(input: {
    id?: string;
    email: string;
    name?: string;
    emailVerified?: boolean;
}): Promise<string> {
    const db = getDb();
    const id = input.id || randomUUID();
    const email = input.email.toLowerCase();
    const timestamp = now();
    await db
        .insert(user)
        .values({
            id,
            email,
            name: input.name || email.split("@")[0] || "User",
            emailVerified: input.emailVerified ?? true,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoNothing({ target: user.email });
    const existing = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
    if (!existing[0]) throw new Error("Failed to create user");
    return existing[0].id;
}

export async function ensureProfile(input: {
    userId: string;
    publicUserId?: string;
    active?: boolean;
}): Promise<AccountUser> {
    const db = getDb();
    const existing = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, input.userId))
        .limit(1);
    if (!existing[0]) {
        await db.insert(profiles).values({
            userId: input.userId,
            publicUserId: input.publicUserId || getUniqueId(),
            active: input.active ?? true,
        });
    }
    // The default app has no API key: a key nobody has seen would be a live
    // credential with no use. Keys are created in the dashboard, or from
    // MEDIALIT_BOOTSTRAP_API_KEY.
    const existingApps = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.userId, input.userId), eq(apps.deleted, false)))
        .limit(1);
    if (!existingApps[0]) {
        await createApp({
            userId: input.userId,
            name: process.env.DEFAULT_APP_NAME || "My Store",
            isDefault: true,
        });
    }
    const account = await findUserById(input.userId);
    if (!account) throw new Error("Failed to load user profile");
    return account;
}

export async function createAccount(input: {
    id?: string;
    email: string;
    name?: string;
    publicUserId?: string;
}): Promise<AccountUser> {
    const userId = await insertAuthUser(input);
    return ensureProfile({
        userId,
        publicUserId: input.publicUserId,
    });
}

export async function createApp(input: {
    userId: string;
    name: string;
    isDefault?: boolean;
    /** Public ID; generated when omitted. The Mongo importer passes one. */
    appId?: string;
    deleted?: boolean;
}): Promise<AppRecord> {
    const db = getDb();
    const timestamp = now();
    const [row] = await db
        .insert(apps)
        .values({
            id: randomUUID(),
            appId: input.appId || getUniqueId(),
            name: input.name,
            userId: input.userId,
            deleted: input.deleted ?? false,
            isDefault: input.isDefault ?? false,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .returning();
    if (!row) throw new Error("Failed to create app");
    return mapApp(row);
}

export async function listApps(
    userId: string,
    appId?: string,
): Promise<AppRecord[]> {
    const db = getDb();
    const filters = [eq(apps.userId, userId), eq(apps.deleted, false)];
    if (appId) filters.push(eq(apps.appId, appId));
    const rows = await db
        .select()
        .from(apps)
        .where(and(...filters))
        .orderBy(asc(apps.createdAt));
    return rows.map(mapApp);
}

/** The user's app with this public ID, unless it is deleted. */
export async function getAppByPublicId(
    userId: string,
    appId: string,
): Promise<AppRecord | null> {
    const rows = await listApps(userId, appId);
    return rows[0] ?? null;
}

/** The app with this internal ID, deleted or not. */
export async function getAppById(id: string): Promise<AppRecord | null> {
    const db = getDb();
    const [row] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return row ? mapApp(row) : null;
}

export async function renameApp(input: {
    userId: string;
    appId?: string;
    name?: string;
    newName: string;
}): Promise<void> {
    const db = getDb();
    const filters = [eq(apps.userId, input.userId), eq(apps.deleted, false)];
    if (input.appId) filters.push(eq(apps.appId, input.appId));
    if (input.name) filters.push(eq(apps.name, input.name));
    await db
        .update(apps)
        .set({ name: input.newName, updatedAt: now() })
        .where(and(...filters));
}

export async function setDefaultApp(
    userId: string,
    appId: string,
): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
        const [target] = await tx
            .select({ id: apps.id, isDefault: apps.isDefault })
            .from(apps)
            .where(
                and(
                    eq(apps.userId, userId),
                    eq(apps.appId, appId),
                    eq(apps.deleted, false),
                ),
            )
            .limit(1);
        if (!target) throw new Error("App not found");
        if (target.isDefault) return;

        const timestamp = now();
        await tx
            .update(apps)
            .set({ isDefault: false, updatedAt: timestamp })
            .where(
                and(
                    eq(apps.userId, userId),
                    eq(apps.isDefault, true),
                    eq(apps.deleted, false),
                ),
            );
        await tx
            .update(apps)
            .set({ isDefault: true, updatedAt: timestamp })
            .where(eq(apps.id, target.id));
    });
}

/** Deletes the app, revokes all of its keys and deletes its signatures, so
 * nothing issued for it keeps working. The default app can't be deleted. */
export async function softDeleteApp(
    userId: string,
    appId: string,
): Promise<void> {
    const db = getDb();
    const existing = await getAppByPublicId(userId, appId);
    if (!existing) return;
    if (existing.default) {
        throw new Error("Default app cannot be deleted");
    }
    await db.transaction(async (tx) => {
        const timestamp = now();
        await tx
            .update(apps)
            .set({ deleted: true, updatedAt: timestamp })
            .where(eq(apps.id, existing.id));
        await tx
            .update(apiKeys)
            .set({ revokedAt: timestamp })
            .where(
                and(eq(apiKeys.appId, existing.id), isNull(apiKeys.revokedAt)),
            );
        await tx.delete(signatures).where(eq(signatures.appId, existing.id));
    });
}

/** Not revoked and not expired. */
function activeKeyCondition(at: Date): SQL {
    return and(
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, at)),
    )!;
}

export async function insertApiKey(input: {
    appId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    createdByType: ApiKeyCreatedByType;
    createdById?: string;
    expiresAt?: Date;
    /** When set, refuse with ApiKeyLimitError if the app already has this many
     * active keys. The app row is locked so concurrent creates can't race. */
    limit?: number;
}): Promise<ApiKeyRecord> {
    const db = getDb();
    return db.transaction(async (tx) => {
        if (input.limit !== undefined) {
            await tx
                .select({ id: apps.id })
                .from(apps)
                .where(eq(apps.id, input.appId))
                .for("update");
            const [active] = await tx
                .select({ count: count() })
                .from(apiKeys)
                .where(
                    and(
                        eq(apiKeys.appId, input.appId),
                        activeKeyCondition(now()),
                    ),
                );
            if (Number(active?.count ?? 0) >= input.limit) {
                throw new ApiKeyLimitError(input.limit);
            }
        }
        const [row] = await tx
            .insert(apiKeys)
            .values({
                id: randomUUID(),
                apiKeyId: `ak_${getUniqueId()}`,
                appId: input.appId,
                name: input.name,
                keyHash: input.keyHash,
                keyPrefix: input.keyPrefix,
                expiresAt: input.expiresAt,
                createdByType: input.createdByType,
                createdById: input.createdById,
                createdAt: now(),
            })
            .returning();
        if (!row) throw new Error("Failed to create API key");
        return mapApiKey(row);
    });
}

/** The app's usable keys, oldest first. */
export async function listActiveApiKeys(
    appId: string,
): Promise<ApiKeyRecord[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.appId, appId), activeKeyCondition(now())))
        .orderBy(asc(apiKeys.createdAt));
    return rows.map(mapApiKey);
}

/** The usable key with this hash, its app and whether the owner is active.
 * Revoked or expired keys and keys of deleted apps don't resolve. */
export async function findApiKeyForAuth(
    keyHash: string,
): Promise<ApiKeyAuthRecord | null> {
    const db = getDb();
    const [row] = await db
        .select({ key: apiKeys, app: apps, ownerActive: profiles.active })
        .from(apiKeys)
        .innerJoin(apps, eq(apps.id, apiKeys.appId))
        .innerJoin(profiles, eq(profiles.userId, apps.userId))
        .where(
            and(
                eq(apiKeys.keyHash, keyHash),
                activeKeyCondition(now()),
                eq(apps.deleted, false),
            ),
        )
        .limit(1);
    if (!row) return null;
    return {
        key: mapApiKey(row.key),
        app: mapApp(row.app),
        ownerActive: row.ownerActive,
    };
}

/** The key with this hash in any state. */
export async function findApiKeyByHash(
    keyHash: string,
): Promise<ApiKeyRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);
    return row ? mapApiKey(row) : null;
}

/** Revokes an active key of the app and deletes the signatures it minted.
 * Returns false when the app has no active key with that public ID. */
export async function revokeApiKey(
    appId: string,
    apiKeyId: string,
): Promise<boolean> {
    const db = getDb();
    return db.transaction(async (tx) => {
        const revoked = await tx
            .update(apiKeys)
            .set({ revokedAt: now() })
            .where(
                and(
                    eq(apiKeys.appId, appId),
                    eq(apiKeys.apiKeyId, apiKeyId),
                    activeKeyCondition(now()),
                ),
            )
            .returning({ id: apiKeys.id });
        if (!revoked[0]) return false;
        await tx
            .delete(signatures)
            .where(eq(signatures.apiKeyId, revoked[0].id));
        return true;
    });
}

/** Records use at most once every five minutes, so busy keys don't write on
 * every request. */
export async function touchApiKeyLastUsed(id: string): Promise<void> {
    const db = getDb();
    await db
        .update(apiKeys)
        .set({ lastUsedAt: now() })
        .where(
            and(
                eq(apiKeys.id, id),
                or(
                    isNull(apiKeys.lastUsedAt),
                    lt(apiKeys.lastUsedAt, sql`now() - interval '5 minutes'`),
                ),
            ),
        );
}

export type BootstrapKeyOutcome =
    | "unchanged"
    | "created"
    | "restored"
    | "conflict";

/**
 * Makes the key with this hash the one active bootstrap key. A new key goes on
 * `appId`; an existing bootstrap key stays on its app, so changing the default
 * app later doesn't move or break it. Every other active bootstrap key is
 * revoked and its signatures deleted. `conflict` means the hash belongs to a
 * key that isn't a bootstrap key.
 */
export async function syncBootstrapApiKey(input: {
    appId: string;
    keyHash: string;
    keyPrefix: string;
    name: string;
}): Promise<BootstrapKeyOutcome> {
    const db = getDb();
    return db.transaction(async (tx) => {
        const [existing] = await tx
            .select()
            .from(apiKeys)
            .where(eq(apiKeys.keyHash, input.keyHash))
            .limit(1);
        if (existing && existing.createdByType !== "bootstrap") {
            return "conflict";
        }

        const timestamp = now();
        const others = await tx
            .update(apiKeys)
            .set({ revokedAt: timestamp })
            .where(
                and(
                    eq(apiKeys.createdByType, "bootstrap"),
                    isNull(apiKeys.revokedAt),
                    ne(apiKeys.keyHash, input.keyHash),
                ),
            )
            .returning({ id: apiKeys.id });
        if (others.length > 0) {
            await tx.delete(signatures).where(
                inArray(
                    signatures.apiKeyId,
                    others.map((key) => key.id),
                ),
            );
        }

        if (existing) {
            if (!existing.revokedAt && !existing.expiresAt) return "unchanged";
            await tx
                .update(apiKeys)
                .set({ revokedAt: null, expiresAt: null })
                .where(eq(apiKeys.id, existing.id));
            return "restored";
        }

        // Another replica starting at the same time may insert it first.
        const inserted = await tx
            .insert(apiKeys)
            .values({
                id: randomUUID(),
                apiKeyId: `ak_${getUniqueId()}`,
                appId: input.appId,
                name: input.name,
                keyHash: input.keyHash,
                keyPrefix: input.keyPrefix,
                createdByType: "bootstrap",
                createdAt: timestamp,
            })
            .onConflictDoNothing({ target: apiKeys.keyHash })
            .returning({ id: apiKeys.id });
        return inserted.length > 0 ? "created" : "unchanged";
    });
}

/** Upserts so revisiting the app picker overwrites the earlier choice.
 * `appId` is the internal app ID. */
export async function setOAuthAppSelection(
    sessionId: string,
    appId: string,
): Promise<void> {
    const db = getDb();
    await db
        .insert(oauthAppSelections)
        .values({ sessionId, appId })
        .onConflictDoUpdate({
            target: oauthAppSelections.sessionId,
            set: { appId, updatedAt: now() },
        });
}

/** The public ID of the app picked for this session, or `null` if the user
 * has not picked one or the app has since been deleted. */
export async function getOAuthAppSelection(
    sessionId: string,
): Promise<{ appId: string; updatedAt: Date } | null> {
    const db = getDb();
    const [row] = await db
        .select({
            appId: apps.appId,
            updatedAt: oauthAppSelections.updatedAt,
        })
        .from(oauthAppSelections)
        .innerJoin(apps, eq(apps.id, oauthAppSelections.appId))
        .where(
            and(
                eq(oauthAppSelections.sessionId, sessionId),
                eq(apps.deleted, false),
            ),
        )
        .limit(1);
    return row ?? null;
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type MediaKindFilter = "image" | "video" | "pdf" | "other";

/* SQL twin of mediaKind() in media/kind.ts; keep the two in step. The kinds
   never overlap: image and video go by type prefix, pdf is any other type
   that names pdf, and other is everything left. */
function mediaKindCondition(kind: MediaKindFilter): SQL {
    const mimeType = sql`lower(${media.mimeType})`;
    const isImage = sql`${mimeType} like 'image/%'`;
    const isVideo = sql`${mimeType} like 'video/%'`;
    const namesPdf = sql`${mimeType} like '%pdf%'`;
    if (kind === "image") return sql`(${isImage})`;
    if (kind === "video") return sql`(${isVideo})`;
    if (kind === "pdf") {
        return sql`(not (${isImage}) and not (${isVideo}) and ${namesPdf})`;
    }
    return sql`(not (${isImage}) and not (${isVideo}) and not (${namesPdf}))`;
}

export async function createMediaRecord(
    input: Omit<MediaRecord, "id" | "_id" | "createdAt" | "updatedAt"> & {
        id?: string;
        createdAt?: Date;
    },
): Promise<MediaRecord> {
    const db = getDb();
    const timestamp = input.createdAt || now();
    const [row] = await db
        .insert(media)
        .values({
            id: input.id || randomUUID(),
            fileName: input.fileName,
            mediaId: input.mediaId,
            userId: input.userId,
            appId: input.appId,
            originalFileName: input.originalFileName,
            mimeType: input.mimeType,
            size: input.size,
            thumbnailGenerated: input.thumbnailGenerated,
            accessControl: input.accessControl,
            group: input.group,
            caption: input.caption,
            temp: input.temp,
            createdAt: timestamp,
            updatedAt: input.createdAt || timestamp,
        })
        .returning();
    if (!row) throw new Error("Failed to create media");
    return mapMedia(row);
}

export async function getMediaRecord(input: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<MediaRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(media)
        .where(
            and(
                eq(media.userId, input.userId),
                eq(media.appId, input.appId),
                eq(media.mediaId, input.mediaId),
            ),
        )
        .limit(1);
    return row ? mapMedia(row) : null;
}

export async function countMedia(input: {
    userId: string;
    appId: string;
    access?: "public" | "private";
    group?: string;
    search?: string;
    kind?: MediaKindFilter;
}): Promise<number> {
    const db = getDb();
    const filters = [
        eq(media.userId, input.userId),
        eq(media.appId, input.appId),
        eq(media.temp, false),
    ];
    if (input.access) filters.push(eq(media.accessControl, input.access));
    if (input.group && input.group.trim()) {
        filters.push(like(media.group, `${escapeLike(input.group.trim())}%`));
    }
    if (input.search?.trim()) {
        filters.push(
            ilike(
                media.originalFileName,
                `%${escapeLike(input.search.trim())}%`,
            ),
        );
    }
    if (input.kind) filters.push(mediaKindCondition(input.kind));
    const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(media)
        .where(and(...filters));
    return Number(row?.count ?? 0);
}

export async function listMedia(input: {
    userId: string;
    appId: string;
    access?: "public" | "private";
    group?: string;
    page?: number;
    recordsPerPage?: number;
    search?: string;
    kind?: MediaKindFilter;
    sort?: "newest" | "oldest" | "name" | "largest";
}): Promise<MediaRecord[]> {
    const db = getDb();
    const limit = input.recordsPerPage || 10;
    const offset = input.page ? (input.page - 1) * limit : 0;
    const filters = [
        eq(media.userId, input.userId),
        eq(media.appId, input.appId),
        eq(media.temp, false),
    ];
    if (input.access) filters.push(eq(media.accessControl, input.access));
    if (input.group && input.group.trim()) {
        filters.push(like(media.group, `${escapeLike(input.group.trim())}%`));
    }
    if (input.search?.trim()) {
        filters.push(
            ilike(
                media.originalFileName,
                `%${escapeLike(input.search.trim())}%`,
            ),
        );
    }
    if (input.kind) filters.push(mediaKindCondition(input.kind));
    const orderBy =
        input.sort === "oldest"
            ? asc(media.createdAt)
            : input.sort === "name"
              ? asc(media.originalFileName)
              : input.sort === "largest"
                ? desc(media.size)
                : desc(media.createdAt);
    const rows = await db
        .select()
        .from(media)
        .where(and(...filters))
        .orderBy(orderBy, desc(media.mediaId))
        .limit(limit)
        .offset(offset);
    return rows.map(mapMedia);
}

export async function totalMediaSize(input: {
    userId: string;
    appId?: string;
}): Promise<number> {
    const db = getDb();
    const filters = [eq(media.userId, input.userId), eq(media.temp, false)];
    if (input.appId) filters.push(eq(media.appId, input.appId));
    const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${media.size}), 0)::float8` })
        .from(media)
        .where(and(...filters));
    return Number(row?.total ?? 0);
}

export async function listAppMediaSummaries(
    userId: string,
    appId?: string,
): Promise<AppMediaSummary[]> {
    const db = getDb();
    const filters = [eq(media.userId, userId), eq(media.temp, false)];
    if (appId) filters.push(eq(media.appId, appId));
    const countOf = (kind: MediaKindFilter) =>
        sql<number>`count(*) filter (where ${mediaKindCondition(kind)})::int`;
    const storageOf = (kind: MediaKindFilter) =>
        sql<number>`coalesce(sum(${media.size}) filter (where ${mediaKindCondition(kind)}), 0)::float8`;
    const rows = await db
        .select({
            appId: media.appId,
            count: sql<number>`count(*)::int`,
            storage: sql<number>`coalesce(sum(${media.size}), 0)::float8`,
            images: countOf("image"),
            videos: countOf("video"),
            pdfs: countOf("pdf"),
            others: countOf("other"),
            imageStorage: storageOf("image"),
            videoStorage: storageOf("video"),
            pdfStorage: storageOf("pdf"),
            otherStorage: storageOf("other"),
            lastUpload: sql<Date | null>`max(${media.createdAt})`,
        })
        .from(media)
        .where(and(...filters))
        .groupBy(media.appId);

    return rows.map((row) => ({
        ...row,
        count: Number(row.count),
        storage: Number(row.storage),
        images: Number(row.images),
        videos: Number(row.videos),
        pdfs: Number(row.pdfs),
        others: Number(row.others),
        imageStorage: Number(row.imageStorage),
        videoStorage: Number(row.videoStorage),
        pdfStorage: Number(row.pdfStorage),
        otherStorage: Number(row.otherStorage),
        lastUpload: row.lastUpload ? new Date(row.lastUpload) : null,
    }));
}

export async function listMediaRecordsByIds(input: {
    userId: string;
    appId: string;
    mediaIds: string[];
}): Promise<MediaRecord[]> {
    if (input.mediaIds.length === 0) return [];
    const db = getDb();
    const rows = await db
        .select()
        .from(media)
        .where(
            and(
                eq(media.userId, input.userId),
                eq(media.appId, input.appId),
                inArray(media.mediaId, input.mediaIds),
            ),
        );
    return rows.map(mapMedia);
}

export async function deleteMediaRecord(
    userId: string,
    mediaId: string,
): Promise<void> {
    const db = getDb();
    await db
        .delete(media)
        .where(and(eq(media.userId, userId), eq(media.mediaId, mediaId)));
}

export async function sealMediaRecord(input: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<void> {
    const db = getDb();
    await db
        .update(media)
        .set({ temp: false, updatedAt: now() })
        .where(
            and(
                eq(media.userId, input.userId),
                eq(media.appId, input.appId),
                eq(media.mediaId, input.mediaId),
            ),
        );
}

export async function listExpiredTempMedia(
    cutoff: Date,
): Promise<MediaRecord[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(media)
        .where(and(eq(media.temp, true), lt(media.createdAt, cutoff)));
    return rows.map(mapMedia);
}

export async function deleteMediaById(id: string): Promise<void> {
    const db = getDb();
    await db.delete(media).where(eq(media.id, id));
}

export async function getMediaSettingsRecord(
    userId: string,
    appId: string,
): Promise<MediaSettingsRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(mediaSettings)
        .where(
            and(
                eq(mediaSettings.userId, userId),
                eq(mediaSettings.appId, appId),
            ),
        )
        .limit(1);
    if (!row) return null;
    return {
        userId: row.userId,
        appId: row.appId,
        useWebP: row.useWebP ?? undefined,
        webpOutputQuality: row.webpOutputQuality ?? undefined,
        thumbnailWidth: row.thumbnailWidth ?? undefined,
        thumbnailHeight: row.thumbnailHeight ?? undefined,
    };
}

export async function upsertMediaSettings(
    input: MediaSettingsRecord,
): Promise<void> {
    const db = getDb();
    await db
        .insert(mediaSettings)
        .values({
            id: randomUUID(),
            userId: input.userId,
            appId: input.appId,
            useWebP: input.useWebP,
            webpOutputQuality: input.webpOutputQuality,
            thumbnailWidth: input.thumbnailWidth,
            thumbnailHeight: input.thumbnailHeight,
        })
        .onConflictDoUpdate({
            target: mediaSettings.appId,
            set: {
                useWebP: input.useWebP,
                webpOutputQuality: input.webpOutputQuality,
                thumbnailWidth: input.thumbnailWidth,
                thumbnailHeight: input.thumbnailHeight,
            },
        });
}

export async function createSignature(input: {
    userId: string;
    appId: string;
    apiKeyId?: string;
    group?: string;
    id?: string;
    signature?: string;
    validTill?: Date;
    createdAt?: Date;
}): Promise<SignatureRecord> {
    const db = getDb();
    const [row] = await db
        .insert(signatures)
        .values({
            id: input.id || randomUUID(),
            userId: input.userId,
            appId: input.appId,
            apiKeyId: input.apiKeyId,
            signature: input.signature || getUniqueId(SIGNATURE_LENGTH),
            validTill:
                input.validTill ||
                new Date(Date.now() + SIGNATURE_VALIDITY_MINUTES * 60000),
            group: input.group,
            createdAt: input.createdAt || now(),
        })
        .returning();
    if (!row) throw new Error("Failed to create signature");
    return mapSignature(row);
}

function mapSignature(row: typeof signatures.$inferSelect): SignatureRecord {
    return {
        id: row.id,
        userId: row.userId,
        appId: row.appId,
        apiKeyId: row.apiKeyId ?? undefined,
        signature: row.signature,
        validTill: row.validTill,
        group: row.group || undefined,
    };
}

/** The signature, if its app is not deleted and the key that minted it (if
 * any) is not revoked. Expiry is left to the caller. */
export async function getSignature(
    signature: string,
): Promise<ActiveSignatureRecord | null> {
    const db = getDb();
    const [row] = await db
        .select({
            signature: signatures,
            ownerActive: profiles.active,
        })
        .from(signatures)
        .innerJoin(apps, eq(apps.id, signatures.appId))
        .innerJoin(profiles, eq(profiles.userId, apps.userId))
        .leftJoin(apiKeys, eq(apiKeys.id, signatures.apiKeyId))
        .where(
            and(
                eq(signatures.signature, signature),
                eq(apps.deleted, false),
                or(isNull(signatures.apiKeyId), isNull(apiKeys.revokedAt)),
            ),
        )
        .limit(1);
    if (!row) return null;
    return { ...mapSignature(row.signature), ownerActive: row.ownerActive };
}

export async function deleteSignatureById(id: string): Promise<void> {
    const db = getDb();
    await db.delete(signatures).where(eq(signatures.id, id));
}

export async function deleteSignatureValue(signature: string): Promise<void> {
    const db = getDb();
    await db.delete(signatures).where(eq(signatures.signature, signature));
}

export async function deleteExpiredSignatures(userId: string): Promise<void> {
    const db = getDb();
    await db
        .delete(signatures)
        .where(
            and(eq(signatures.userId, userId), lt(signatures.validTill, now())),
        );
}

export async function createTusUploadRecord(input: {
    uploadId: string;
    userId: string;
    appId: string;
    uploadLength: number;
    metadata: TusMetadata;
    tempFilePath?: string;
    signature?: string;
    expiresAt: Date;
}): Promise<TusUploadRecord> {
    const db = getDb();
    const timestamp = now();
    const [row] = await db
        .insert(tusUploads)
        .values({
            id: randomUUID(),
            uploadId: input.uploadId,
            userId: input.userId,
            appId: input.appId,
            uploadLength: input.uploadLength,
            uploadOffset: 0,
            metadata: input.metadata,
            tempFilePath: input.tempFilePath,
            signature: input.signature,
            isComplete: false,
            expiresAt: input.expiresAt,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .returning();
    if (!row) throw new Error("Failed to create tus upload");
    return mapTus(row);
}

function mapTus(row: typeof tusUploads.$inferSelect): TusUploadRecord {
    return {
        id: row.id,
        _id: row.id,
        uploadId: row.uploadId,
        userId: row.userId,
        appId: row.appId,
        uploadLength: row.uploadLength,
        uploadOffset: row.uploadOffset,
        metadata: row.metadata as TusMetadata,
        tempFilePath: row.tempFilePath || undefined,
        signature: row.signature || undefined,
        isComplete: row.isComplete,
        expiresAt: row.expiresAt || undefined,
        createdAt: row.createdAt,
    };
}

export async function getTusUploadRecord(
    uploadId: string,
): Promise<TusUploadRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(tusUploads)
        .where(eq(tusUploads.uploadId, uploadId))
        .limit(1);
    return row ? mapTus(row) : null;
}

export async function updateTusOffset(
    uploadId: string,
    uploadOffset: number,
): Promise<void> {
    const db = getDb();
    await db
        .update(tusUploads)
        .set({ uploadOffset, updatedAt: now() })
        .where(eq(tusUploads.uploadId, uploadId));
}

export async function markTusComplete(uploadId: string): Promise<void> {
    const db = getDb();
    await db
        .update(tusUploads)
        .set({ isComplete: true, updatedAt: now() })
        .where(eq(tusUploads.uploadId, uploadId));
}

export async function deleteTusUploadRecord(uploadId: string): Promise<void> {
    const db = getDb();
    await db.delete(tusUploads).where(eq(tusUploads.uploadId, uploadId));
}

export async function listTusByUser(
    userId: string,
): Promise<TusUploadRecord[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(tusUploads)
        .where(eq(tusUploads.userId, userId))
        .orderBy(desc(tusUploads.createdAt));
    return rows.map(mapTus);
}

export async function listExpiredTus(before: Date): Promise<TusUploadRecord[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(tusUploads)
        .where(lt(tusUploads.expiresAt, before));
    return rows.map(mapTus);
}

export async function deleteTusById(id: string): Promise<void> {
    const db = getDb();
    await db.delete(tusUploads).where(eq(tusUploads.id, id));
}

export async function seedWebOAuthClient(input: {
    redirectUris: string[];
}): Promise<void> {
    const db = getDb();
    const existing = await db
        .select({ id: oauthClient.id })
        .from(oauthClient)
        .where(eq(oauthClient.clientId, "web-client"))
        .limit(1);
    if (existing[0]) return;
    const timestamp = now();
    await db.insert(oauthClient).values({
        id: randomUUID(),
        clientId: "web-client",
        name: "MediaLit Web",
        redirectUris: input.redirectUris,
        skipConsent: true,
        disabled: false,
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        requirePKCE: true,
        scopes: ["openid", "profile", "email", "offline_access"],
        createdAt: timestamp,
        updatedAt: timestamp,
    });
}
