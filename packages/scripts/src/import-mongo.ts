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
    revokeLegacyToken,
    updateSubscription,
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
    "legacy_revoked_tokens",
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
                `Postgres is missing ${missing.join(", ")}. Start the API so it applies migrations, then run import:mongo again.`,
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
        let importedUsers = 0;
        for (const doc of users) {
            const mongoId = idOf(doc._id);
            const email = String(doc.email || "").toLowerCase();
            if (!email) continue;
            const existing = await findUserByEmail(email);
            if (existing && existing.id !== mongoId) {
                console.warn(
                    `skip user ${email}: postgres id differs from mongo _id`,
                );
                continue;
            }
            const userId = existing
                ? existing.id
                : await insertAuthUser({
                      id: mongoId,
                      email,
                      name: doc.name ? String(doc.name) : undefined,
                      emailVerified: true,
                  });
            await importKeys(db, doc._id, userId);
            const account = await ensureProfile({
                userId,
                publicUserId: doc.userId ? String(doc.userId) : undefined,
                subscriptionStatus: doc.subscriptionStatus,
                active: doc.active !== false,
            });
            await updateSubscription(account.userId, {
                subscriptionMethod: doc.subscriptionMethod,
                customerId: doc.customerId ? String(doc.customerId) : undefined,
                subscriptionId: doc.subscriptionId
                    ? String(doc.subscriptionId)
                    : undefined,
                subscriptionStatus: doc.subscriptionStatus,
                subscriptionEndsAfter: asDate(doc.subscriptionEndsAfter),
            });
            await importMediaSettings(db, doc._id, userId);
            importedUsers += 1;
        }

        const media = await db.collection("media").find({}).toArray();
        let importedMedia = 0;
        for (const doc of media) {
            await createMediaRecord({
                id: idOf(doc._id),
                fileName: String(doc.fileName),
                mediaId: String(doc.mediaId),
                userId: idOf(doc.userId),
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
        for (const doc of signatures) {
            if (!doc.signature || !doc.userId || !doc.apikey) continue;
            await createSignature({
                id: idOf(doc._id),
                userId: idOf(doc.userId),
                apikey: String(doc.apikey),
                signature: String(doc.signature),
                validTill: asDate(doc.validTill) || new Date(),
                group: doc.group ? String(doc.group) : undefined,
                createdAt: asDate(doc.createdAt),
            });
        }

        const revoked = await db
            .collection("oauthrevokedtokens")
            .find({})
            .toArray()
            .catch(() => [] as Document[]);
        for (const doc of revoked) {
            if (!doc.jti) continue;
            await revokeLegacyToken({
                jti: String(doc.jti),
                userId: String(doc.userId || ""),
                clientId: String(doc.clientId || ""),
                expiresAt: asDate(doc.expiresAt) || new Date(),
            });
        }

        console.log(
            JSON.stringify({
                users: importedUsers,
                media: importedMedia,
                signatures: signatures.length,
                revoked: revoked.length,
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
        if (!key.key || !key.name) continue;
        await createApiKey({
            userId,
            name: String(key.name),
            key: String(key.key),
            keyId: key.keyId ? String(key.keyId) : undefined,
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
