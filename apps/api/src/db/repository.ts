import { randomUUID } from "node:crypto";
import { getUniqueId } from "@medialit/utils";
import { and, asc, desc, eq, ilike, like, lt, sql } from "drizzle-orm";
import { getDb } from "./client.js";
import {
    apiKeys,
    media,
    mediaSettings,
    oauthAppSelections,
    oauthClient,
    profiles,
    signatures,
    tusUploads,
    user,
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

const API_KEY_RESTRICTIONS = ["referrer", "ipaddress", "custom"] as const;
type ApiKeyRestriction = (typeof API_KEY_RESTRICTIONS)[number];

export type ApiKeyRecord = {
    id: string;
    keyId: string;
    name: string;
    key: string;
    userId: string;
    restriction?: ApiKeyRestriction;
    httpReferrers: string[];
    ipAddresses: string[];
    default: boolean;
    deleted: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type MediaRecord = {
    id: string;
    _id: string;
    fileName: string;
    mediaId: string;
    userId: string;
    apikey: string;
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

export type ApiKeyMediaSummary = {
    apikey: string;
    count: number;
    storage: number;
    images: number;
    videos: number;
    pdfs: number;
    imageStorage: number;
    videoStorage: number;
    pdfStorage: number;
    otherStorage: number;
    lastUpload: Date | null;
};

export type MediaSettingsRecord = {
    userId: string;
    apikey: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
};

export type SignatureRecord = {
    id: string;
    userId: string;
    apikey: string;
    signature: string;
    validTill: Date;
    group?: string;
};

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
    apikey: string;
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

function mapKey(row: typeof apiKeys.$inferSelect): ApiKeyRecord {
    return {
        id: row.id,
        keyId: row.keyId,
        name: row.name,
        key: row.key,
        userId: row.userId,
        restriction: API_KEY_RESTRICTIONS.includes(
            row.restriction as ApiKeyRestriction,
        )
            ? (row.restriction as ApiKeyRestriction)
            : undefined,
        httpReferrers: row.httpReferrers ?? [],
        ipAddresses: row.ipAddresses ?? [],
        default: row.isDefault,
        deleted: row.deleted,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapMedia(row: typeof media.$inferSelect): MediaRecord {
    return {
        id: row.id,
        _id: row.id,
        fileName: row.fileName,
        mediaId: row.mediaId,
        userId: row.userId,
        apikey: row.apikey,
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
    const keys = await db
        .select({ id: apiKeys.id })
        .from(apiKeys)
        .where(
            and(eq(apiKeys.userId, input.userId), eq(apiKeys.deleted, false)),
        )
        .limit(1);
    if (!keys[0]) {
        await createApiKey({
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

export async function createApiKey(input: {
    userId: string;
    name: string;
    isDefault?: boolean;
    key?: string;
    keyId?: string;
    restriction?: string;
    httpReferrers?: string[];
    ipAddresses?: string[];
    deleted?: boolean;
}): Promise<ApiKeyRecord> {
    const db = getDb();
    const timestamp = now();
    const [row] = await db
        .insert(apiKeys)
        .values({
            id: randomUUID(),
            keyId: input.keyId || getUniqueId(),
            name: input.name,
            key: input.key || getUniqueId(),
            userId: input.userId,
            restriction: input.restriction,
            httpReferrers: input.httpReferrers ?? [],
            ipAddresses: input.ipAddresses ?? [],
            deleted: input.deleted ?? false,
            isDefault: input.isDefault ?? false,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .returning();
    if (!row) throw new Error("Failed to create API key");
    return mapKey(row);
}

export async function getApiKeyBySecret(
    key: string,
): Promise<ApiKeyRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.key, key))
        .limit(1);
    return row ? mapKey(row) : null;
}

export async function listApiKeys(
    userId: string,
    keyId?: string,
): Promise<ApiKeyRecord[]> {
    const db = getDb();
    const filters = [eq(apiKeys.userId, userId), eq(apiKeys.deleted, false)];
    if (keyId) filters.push(eq(apiKeys.keyId, keyId));
    const rows = await db
        .select()
        .from(apiKeys)
        .where(and(...filters))
        .orderBy(asc(apiKeys.createdAt));
    return rows.map(mapKey);
}

export async function getApiKeyByKeyId(
    userId: string,
    keyId: string,
): Promise<ApiKeyRecord | null> {
    const rows = await listApiKeys(userId, keyId);
    return rows[0] ?? null;
}

export async function renameApiKey(input: {
    userId: string;
    keyId?: string;
    name?: string;
    newName: string;
}): Promise<void> {
    const db = getDb();
    const filters = [
        eq(apiKeys.userId, input.userId),
        eq(apiKeys.deleted, false),
    ];
    if (input.keyId) filters.push(eq(apiKeys.keyId, input.keyId));
    if (input.name) filters.push(eq(apiKeys.name, input.name));
    await db
        .update(apiKeys)
        .set({ name: input.newName, updatedAt: now() })
        .where(and(...filters));
}

export async function setDefaultApiKey(
    userId: string,
    keyId: string,
): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
        const [target] = await tx
            .select({ id: apiKeys.id, isDefault: apiKeys.isDefault })
            .from(apiKeys)
            .where(
                and(
                    eq(apiKeys.userId, userId),
                    eq(apiKeys.keyId, keyId),
                    eq(apiKeys.deleted, false),
                ),
            )
            .limit(1);
        if (!target) throw new Error("Apikey not found");
        if (target.isDefault) return;

        const timestamp = now();
        await tx
            .update(apiKeys)
            .set({ isDefault: false, updatedAt: timestamp })
            .where(
                and(
                    eq(apiKeys.userId, userId),
                    eq(apiKeys.isDefault, true),
                    eq(apiKeys.deleted, false),
                ),
            );
        await tx
            .update(apiKeys)
            .set({ isDefault: true, updatedAt: timestamp })
            .where(eq(apiKeys.id, target.id));
    });
}

export async function softDeleteApiKey(
    userId: string,
    keyId: string,
): Promise<void> {
    const db = getDb();
    const existing = await getApiKeyByKeyId(userId, keyId);
    if (!existing) return;
    if (existing.default) {
        throw new Error("Default API key cannot be deleted");
    }
    await db
        .update(apiKeys)
        .set({ deleted: true, updatedAt: now() })
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.keyId, keyId)));
}

/** Upserts so revisiting the app picker overwrites the earlier choice. */
export async function setOAuthAppSelection(
    sessionId: string,
    apiKeyId: string,
): Promise<void> {
    const db = getDb();
    await db
        .insert(oauthAppSelections)
        .values({ sessionId, apiKeyId })
        .onConflictDoUpdate({
            target: oauthAppSelections.sessionId,
            set: { apiKeyId, updatedAt: now() },
        });
}

/** The app picked for this session, or `null` if the user has not picked one
 * or the app has since been deleted. */
export async function getOAuthAppSelection(
    sessionId: string,
): Promise<{ keyId: string; updatedAt: Date } | null> {
    const db = getDb();
    const [row] = await db
        .select({
            keyId: apiKeys.keyId,
            updatedAt: oauthAppSelections.updatedAt,
        })
        .from(oauthAppSelections)
        .innerJoin(apiKeys, eq(apiKeys.id, oauthAppSelections.apiKeyId))
        .where(
            and(
                eq(oauthAppSelections.sessionId, sessionId),
                eq(apiKeys.deleted, false),
            ),
        )
        .limit(1);
    return row ?? null;
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
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
            apikey: input.apikey,
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
    apikey: string;
    mediaId: string;
}): Promise<MediaRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(media)
        .where(
            and(
                eq(media.userId, input.userId),
                eq(media.apikey, input.apikey),
                eq(media.mediaId, input.mediaId),
            ),
        )
        .limit(1);
    return row ? mapMedia(row) : null;
}

export async function countMedia(input: {
    userId: string;
    apikey: string;
    access?: "public" | "private";
    group?: string;
    search?: string;
    kind?: "image" | "video" | "pdf" | "other";
}): Promise<number> {
    const db = getDb();
    const filters = [
        eq(media.userId, input.userId),
        eq(media.apikey, input.apikey),
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
    if (input.kind === "image") filters.push(like(media.mimeType, "image/%"));
    if (input.kind === "video") filters.push(like(media.mimeType, "video/%"));
    if (input.kind === "pdf") filters.push(ilike(media.mimeType, "%pdf%"));
    if (input.kind === "other") {
        filters.push(
            sql`${media.mimeType} not like 'image/%' and ${media.mimeType} not like 'video/%' and lower(${media.mimeType}) not like '%pdf%'`,
        );
    }
    const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(media)
        .where(and(...filters));
    return Number(row?.count ?? 0);
}

export async function listMedia(input: {
    userId: string;
    apikey: string;
    access?: "public" | "private";
    group?: string;
    page?: number;
    recordsPerPage?: number;
    search?: string;
    kind?: "image" | "video" | "pdf" | "other";
    sort?: "newest" | "oldest" | "name" | "largest";
}): Promise<MediaRecord[]> {
    const db = getDb();
    const limit = input.recordsPerPage || 10;
    const offset = input.page ? (input.page - 1) * limit : 0;
    const filters = [
        eq(media.userId, input.userId),
        eq(media.apikey, input.apikey),
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
    if (input.kind === "image") filters.push(like(media.mimeType, "image/%"));
    if (input.kind === "video") filters.push(like(media.mimeType, "video/%"));
    if (input.kind === "pdf") filters.push(ilike(media.mimeType, "%pdf%"));
    if (input.kind === "other") {
        filters.push(
            sql`${media.mimeType} not like 'image/%' and ${media.mimeType} not like 'video/%' and lower(${media.mimeType}) not like '%pdf%'`,
        );
    }
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
    apikey?: string;
}): Promise<number> {
    const db = getDb();
    const filters = [eq(media.userId, input.userId), eq(media.temp, false)];
    if (input.apikey) filters.push(eq(media.apikey, input.apikey));
    const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${media.size}), 0)::float8` })
        .from(media)
        .where(and(...filters));
    return Number(row?.total ?? 0);
}

export async function listApiKeyMediaSummaries(
    userId: string,
): Promise<ApiKeyMediaSummary[]> {
    const db = getDb();
    const rows = await db
        .select({
            apikey: media.apikey,
            count: sql<number>`count(*)::int`,
            storage: sql<number>`coalesce(sum(${media.size}), 0)::float8`,
            images: sql<number>`count(*) filter (where ${media.mimeType} like 'image/%')::int`,
            videos: sql<number>`count(*) filter (where ${media.mimeType} like 'video/%')::int`,
            pdfs: sql<number>`count(*) filter (where ${media.mimeType} like '%pdf%')::int`,
            imageStorage: sql<number>`coalesce(sum(${media.size}) filter (where ${media.mimeType} like 'image/%'), 0)::float8`,
            videoStorage: sql<number>`coalesce(sum(${media.size}) filter (where ${media.mimeType} like 'video/%'), 0)::float8`,
            pdfStorage: sql<number>`coalesce(sum(${media.size}) filter (where ${media.mimeType} like '%pdf%'), 0)::float8`,
            otherStorage: sql<number>`coalesce(sum(${media.size}) filter (where ${media.mimeType} not like 'image/%' and ${media.mimeType} not like 'video/%' and lower(${media.mimeType}) not like '%pdf%'), 0)::float8`,
            lastUpload: sql<Date | null>`max(${media.createdAt})`,
        })
        .from(media)
        .where(and(eq(media.userId, userId), eq(media.temp, false)))
        .groupBy(media.apikey);

    return rows.map((row) => ({
        ...row,
        count: Number(row.count),
        storage: Number(row.storage),
        images: Number(row.images),
        videos: Number(row.videos),
        pdfs: Number(row.pdfs),
        imageStorage: Number(row.imageStorage),
        videoStorage: Number(row.videoStorage),
        pdfStorage: Number(row.pdfStorage),
        otherStorage: Number(row.otherStorage),
    }));
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
    apikey: string;
    mediaId: string;
}): Promise<void> {
    const db = getDb();
    await db
        .update(media)
        .set({ temp: false, updatedAt: now() })
        .where(
            and(
                eq(media.userId, input.userId),
                eq(media.apikey, input.apikey),
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
    apikey: string,
): Promise<MediaSettingsRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(mediaSettings)
        .where(
            and(
                eq(mediaSettings.userId, userId),
                eq(mediaSettings.apikey, apikey),
            ),
        )
        .limit(1);
    if (!row) return null;
    return {
        userId: row.userId,
        apikey: row.apikey,
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
            apikey: input.apikey,
            useWebP: input.useWebP,
            webpOutputQuality: input.webpOutputQuality,
            thumbnailWidth: input.thumbnailWidth,
            thumbnailHeight: input.thumbnailHeight,
        })
        .onConflictDoUpdate({
            target: mediaSettings.apikey,
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
    apikey: string;
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
            apikey: input.apikey,
            signature: input.signature || getUniqueId(SIGNATURE_LENGTH),
            validTill:
                input.validTill ||
                new Date(Date.now() + SIGNATURE_VALIDITY_MINUTES * 60000),
            group: input.group,
            createdAt: input.createdAt || now(),
        })
        .returning();
    if (!row) throw new Error("Failed to create signature");
    return {
        id: row.id,
        userId: row.userId,
        apikey: row.apikey,
        signature: row.signature,
        validTill: row.validTill,
        group: row.group || undefined,
    };
}

export async function getSignature(
    signature: string,
): Promise<SignatureRecord | null> {
    const db = getDb();
    const [row] = await db
        .select()
        .from(signatures)
        .where(eq(signatures.signature, signature))
        .limit(1);
    if (!row) return null;
    return {
        id: row.id,
        userId: row.userId,
        apikey: row.apikey,
        signature: row.signature,
        validTill: row.validTill,
        group: row.group || undefined,
    };
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
    apikey: string;
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
            apikey: input.apikey,
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
        apikey: row.apikey,
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
