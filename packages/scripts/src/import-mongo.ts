import { MongoClient, type Document } from "mongodb";
import pg from "pg";
import {
    closeDb,
    createApiKey,
    createMediaRecord,
    createSignature,
    ensureProfile,
    findUserByEmail,
    insertAuthUser,
    listApiKeys,
    upsertMediaSettings,
} from "../../../apps/api/src/db/index.js";

// The API migrations create these tables. This script only writes rows.
const IMPORT_TABLES = [
    "user",
    "profiles",
    "api_keys",
    "media",
    "media_settings",
    "signatures",
] as const;

export function missingImportTables(present: Iterable<string>): string[] {
    const found = new Set(present);
    return IMPORT_TABLES.filter((name) => !found.has(name));
}

function connectionUrls(): { mongoUrl: string; databaseUrl: string } {
    const mongoUrl = process.env.MONGO_URL || process.env.DB_CONNECTION_STRING;
    const databaseUrl = process.env.DATABASE_URL;
    if (!mongoUrl || !databaseUrl) {
        throw new Error(
            "MONGO_URL (or DB_CONNECTION_STRING) and DATABASE_URL are required",
        );
    }
    return { mongoUrl, databaseUrl };
}

function idOf(value: unknown): string {
    return String(value);
}

// Seal removes the field in Mongo. The hourly cleanup hard-deletes rows
// where temp is true, and deletes their private S3 objects with them.
// Only an explicit boolean true is a draft. Missing, null, and false stay.
export function mongoMediaIsTemp(value: unknown): boolean {
    return value === true;
}

function asDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

async function assertImportTables(databaseUrl: string): Promise<void> {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
        const result = await pool.query<{ table_name: string }>(
            `select table_name
             from information_schema.tables
             where table_schema = 'public'
               and table_name = any($1::text[])`,
            [[...IMPORT_TABLES]],
        );
        const missing = missingImportTables(
            result.rows.map((row) => row.table_name),
        );
        if (missing.length > 0) {
            throw new Error(
                `Postgres is missing ${missing.join(", ")}. Run bun --filter @medialit/api db:migrate, then run import:mongo again.`,
            );
        }
    } finally {
        await pool.end();
    }
}

async function main() {
    const { mongoUrl, databaseUrl } = connectionUrls();
    await assertImportTables(databaseUrl);

    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const db = client.db();
        const users = await db.collection("users").find({}).toArray();
        const importedUserIds = new Map<string, string>();
        let importedUsers = 0;
        for (const doc of users) {
            const mongoId = idOf(doc._id);
            const email = String(doc.email || "").toLowerCase();
            if (!email) continue;
            const existing = await findUserByEmail(email);
            if (existing && existing.id !== mongoId) {
                console.warn(
                    `remap Mongo user ${mongoId} to existing Postgres user ${existing.id} (${email})`,
                );
            }
            const userId = existing
                ? existing.id
                : await insertAuthUser({
                      id: mongoId,
                      email,
                      name: doc.name ? String(doc.name) : undefined,
                      emailVerified: true,
                  });
            importedUserIds.set(mongoId, userId);
            await importKeys(db, doc._id, userId);
            // Subscriptions are not imported: paid plans come only from the
            // billing tables, so v0.4.0 subscription fields are dropped.
            await ensureProfile({
                userId,
                publicUserId: doc.userId ? String(doc.userId) : undefined,
                active: doc.active !== false,
            });
            await importMediaSettings(db, doc._id, userId);
            importedUsers += 1;
        }

        const media = await db.collection("media").find({}).toArray();
        let importedMedia = 0;
        let skippedMedia = 0;
        const orphanedMediaOwners = new Set<string>();
        for (const doc of media) {
            const mongoUserId = idOf(doc.userId);
            const userId = importedUserIds.get(mongoUserId);
            if (!userId) {
                skippedMedia += 1;
                orphanedMediaOwners.add(mongoUserId);
                continue;
            }
            await createMediaRecord({
                id: idOf(doc._id),
                fileName: String(doc.fileName),
                mediaId: String(doc.mediaId),
                userId,
                apikey: String(doc.apikey),
                originalFileName: String(doc.originalFileName),
                mimeType: String(doc.mimeType),
                size: Number(doc.size || 0),
                thumbnailGenerated: Boolean(doc.thumbnailGenerated),
                accessControl:
                    doc.accessControl === "public" ? "public" : "private",
                group: doc.group ? String(doc.group) : undefined,
                caption: doc.caption ? String(doc.caption) : undefined,
                temp: mongoMediaIsTemp(doc.temp),
                createdAt: asDate(doc.createdAt),
            });
            importedMedia += 1;
        }

        const signatures = await db
            .collection("presignedurls")
            .find({})
            .toArray()
            .catch(() => [] as Document[]);
        let importedSignatures = 0;
        let skippedSignatures = 0;
        const orphanedSignatureOwners = new Set<string>();
        for (const doc of signatures) {
            if (!doc.signature || !doc.userId || !doc.apikey) continue;
            const mongoUserId = idOf(doc.userId);
            const userId = importedUserIds.get(mongoUserId);
            if (!userId) {
                skippedSignatures += 1;
                orphanedSignatureOwners.add(mongoUserId);
                continue;
            }
            await createSignature({
                id: idOf(doc._id),
                userId,
                apikey: String(doc.apikey),
                signature: String(doc.signature),
                validTill: asDate(doc.validTill) || new Date(),
                group: doc.group ? String(doc.group) : undefined,
                createdAt: asDate(doc.createdAt),
            });
            importedSignatures += 1;
        }

        if (skippedMedia > 0) {
            console.warn(
                `skipped ${skippedMedia} media records owned by missing Mongo users: ${[...orphanedMediaOwners].join(", ")}`,
            );
        }
        if (skippedSignatures > 0) {
            console.warn(
                `skipped ${skippedSignatures} signatures owned by missing Mongo users: ${[...orphanedSignatureOwners].join(", ")}`,
            );
        }

        console.log(
            JSON.stringify({
                users: importedUsers,
                media: importedMedia,
                signatures: importedSignatures,
                skippedMedia,
                skippedSignatures,
            }),
        );
    } finally {
        await client.close();
        await closeDb();
    }
}

async function importMediaSettings(
    db: ReturnType<MongoClient["db"]>,
    mongoUserId: unknown,
    userId: string,
) {
    const settings = await db
        .collection("mediasettings")
        .find({ userId: mongoUserId })
        .toArray();
    const setting = settings[0];
    if (!setting) return;
    // Old settings were stored per user. The new table is per API key.
    const keys = await listApiKeys(userId);
    for (const key of keys) {
        await upsertMediaSettings({
            userId,
            apikey: key.key,
            useWebP: Boolean(setting.useWebP),
            webpOutputQuality:
                setting.webpOutputQuality == null
                    ? undefined
                    : Number(setting.webpOutputQuality),
            thumbnailWidth:
                setting.thumbnailWidth == null
                    ? undefined
                    : Number(setting.thumbnailWidth),
            thumbnailHeight:
                setting.thumbnailHeight == null
                    ? undefined
                    : Number(setting.thumbnailHeight),
        });
    }
}

async function importKeys(
    db: ReturnType<MongoClient["db"]>,
    mongoUserId: unknown,
    userId: string,
) {
    const keys = await db
        .collection("apikeys")
        .find({ userId: mongoUserId })
        .toArray();
    for (const key of keys) {
        if (!key.key) continue;
        const keyId = key.keyId ? String(key.keyId) : undefined;
        await createApiKey({
            userId,
            name: key.name
                ? String(key.name)
                : `Imported key ${keyId || idOf(key._id)}`,
            key: String(key.key),
            keyId,
            isDefault: Boolean(key.default),
            deleted: Boolean(key.deleted),
            restriction: key.restriction ? String(key.restriction) : undefined,
            httpReferrers: Array.isArray(key.httpReferrers)
                ? key.httpReferrers.map(String)
                : [],
            ipAddresses: Array.isArray(key.ipAddresses)
                ? key.ipAddresses.map(String)
                : [],
        });
    }
}

if (import.meta.main) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
