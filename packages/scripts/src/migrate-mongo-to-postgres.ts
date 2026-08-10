/**
 * One-time data migration: copies every record out of the legacy MongoDB
 * database and inserts it into the new Postgres database (see packages/db).
 *
 * The shared mongoose schemas were removed from @medialit/models as part of
 * the Postgres migration, so this script declares its own minimal,
 * read-only mongoose schemas. Each schema uses the exact same model name the
 * running application used historically (see the deleted apps/api/src/**\/model.ts
 * files), so mongoose's automatic collection-name pluralization resolves to
 * the same collections that already exist in the source database.
 *
 * Identity mapping
 * -----------------
 * Every Postgres table's `id` primary key is seeded with the source
 * document's `_id.toString()`, and every `userId` column referencing a user
 * is seeded from the Mongo ObjectId reference (`.toString()`), which lines
 * up with the new `users.id`. This preserves referential continuity across
 * collections without needing a separate id-remapping pass.
 *
 * The script is idempotent: every insert uses `onConflictDoNothing`, so it
 * can safely be re-run (e.g. after fixing a connection issue) without
 * creating duplicates.
 */

import { config as loadDotFile } from "dotenv";
import path from "path";
import mongoose from "mongoose";
import {
    createDatabase,
    closeDatabase,
    runMigrations,
    users,
    apikeys,
    media,
    mediaSettings,
    tusUploads,
    presignedUrls,
    oauthClients,
    oauthPendingAuths,
    oauthRevokedTokens,
    plans,
    type Database,
} from "@medialit/db";

loadDotFile({ path: path.resolve(__dirname, "../.env") });

const MONGO_CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING;
const PG_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;
const isDryRun = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

const usage = `
Usage:
  pnpm migrate:mongo_to_postgres [flags]

Flags:
  --dry-run    Count records without writing anything to Postgres.

Required Environment Variables:
  MONGO_CONNECTION_STRING   MongoDB connection string (source).
  DB_CONNECTION_STRING      Postgres connection string (destination).
`;

if (!MONGO_CONNECTION_STRING || !PG_CONNECTION_STRING) {
    console.error("❌ Error: Missing required environment variables.");
    console.error(usage);
    process.exit(1);
}

// --- Legacy (read-only) Mongo schemas -------------------------------------
// Loose/`strict: false` so unexpected legacy fields don't crash the read;
// only the fields we actually migrate are declared explicitly.

const UserModel = mongoose.model(
    "User",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const ApikeyModel = mongoose.model(
    "Apikey",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const MediaModel = mongoose.model(
    "Media",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const MediaSettingsModel = mongoose.model(
    "MediaSettings",
    new mongoose.Schema({}, { strict: false }),
);
const TusUploadModel = mongoose.model(
    "TusUpload",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const PreSignedUrlModel = mongoose.model(
    "PreSignedUrl",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const OauthClientModel = mongoose.model(
    "OauthClient",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const OauthPendingAuthModel = mongoose.model(
    "OauthPendingAuth",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const OauthRevokedTokenModel = mongoose.model(
    "OauthRevokedToken",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const PlanModel = mongoose.model(
    "Plan",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);

type AnyDoc = Record<string, any>;

function id(doc: AnyDoc): string {
    return doc._id.toString();
}

function ref(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    return String(value);
}

async function migrateCollection<TDoc extends AnyDoc>({
    label,
    model,
    table,
    transform,
    filter = {},
}: {
    label: string;
    model: mongoose.Model<any>;
    table: any;
    transform: (doc: TDoc) => AnyDoc | null;
    filter?: Record<string, unknown>;
}): Promise<{ migrated: number; skipped: number; total: number }> {
    const total = await model.countDocuments(filter);
    console.log(`\n📦 ${label}: ${total} document(s) found`);

    if (isDryRun) {
        return { migrated: 0, skipped: 0, total };
    }

    let migrated = 0;
    let skipped = 0;
    let batch: AnyDoc[] = [];

    const flush = async () => {
        if (batch.length === 0) return;
        await db!.insert(table).values(batch).onConflictDoNothing();
        migrated += batch.length;
        batch = [];
    };

    const cursor = model.find(filter).lean().cursor();
    for (
        let doc = await cursor.next();
        doc != null;
        doc = await cursor.next()
    ) {
        const row = transform(doc as TDoc);
        if (!row) {
            skipped++;
            continue;
        }
        batch.push(row);
        if (batch.length >= BATCH_SIZE) {
            await flush();
            console.log(`  ⏳ ${migrated}/${total} migrated...`);
        }
    }
    await flush();

    console.log(`  ✅ ${migrated} migrated, ${skipped} skipped (${label})`);
    return { migrated, skipped, total };
}

let db: Database | undefined;

async function migrate() {
    console.log("🚀 Starting Mongo → Postgres migration...");
    if (isDryRun) {
        console.log("⚠️  DRY RUN MODE — no writes will be made to Postgres");
    }

    console.log("🔌 Connecting to MongoDB (source)...");
    await mongoose.connect(MONGO_CONNECTION_STRING!);
    console.log("✅ Connected to MongoDB.");

    if (!isDryRun) {
        console.log("🔌 Connecting to Postgres (destination)...");
        db = createDatabase(PG_CONNECTION_STRING!);
        await runMigrations(db);
        console.log("✅ Connected to Postgres and applied schema migrations.");
    }

    const now = new Date();

    await migrateCollection({
        label: "users",
        model: UserModel,
        table: users,
        transform: (doc) => ({
            id: id(doc),
            userId: doc.userId ?? id(doc),
            email: doc.email,
            active: doc.active ?? true,
            name: doc.name,
            customerId: doc.customerId,
            subscriptionId: doc.subscriptionId,
            subscriptionEndsAfter: doc.subscriptionEndsAfter,
            subscriptionMethod: doc.subscriptionMethod,
            subscriptionStatus: doc.subscriptionStatus ?? "not-subscribed",
            createdAt: doc.createdAt ?? now,
            updatedAt: doc.updatedAt ?? now,
        }),
    });

    await migrateCollection({
        label: "apikeys",
        model: ApikeyModel,
        table: apikeys,
        transform: (doc) => {
            const userId = ref(doc.userId);
            if (!userId) return null;
            return {
                id: id(doc),
                keyId: doc.keyId ?? id(doc),
                name: doc.name,
                key: doc.key,
                userId,
                restriction: doc.restriction,
                httpReferrers: doc.httpReferrers,
                ipAddresses: doc.ipAddresses,
                deleted: doc.deleted ?? false,
                default: doc.default ?? false,
                createdAt: doc.createdAt ?? now,
                updatedAt: doc.updatedAt ?? now,
            };
        },
    });

    await migrateCollection({
        label: "media",
        model: MediaModel,
        table: media,
        transform: (doc) => {
            const userId = ref(doc.userId);
            if (!userId) return null;
            return {
                id: id(doc),
                fileName: doc.fileName,
                mediaId: doc.mediaId,
                userId,
                apikey: doc.apikey,
                originalFileName: doc.originalFileName,
                mimeType: doc.mimeType,
                size: doc.size,
                thumbnailGenerated: doc.thumbnailGenerated ?? false,
                accessControl: doc.accessControl ?? "private",
                group: doc.group,
                caption: doc.caption,
                temp: doc.temp ?? false,
                createdAt: doc.createdAt ?? now,
                updatedAt: doc.updatedAt ?? now,
            };
        },
    });

    await migrateCollection({
        label: "mediaSettings",
        model: MediaSettingsModel,
        table: mediaSettings,
        transform: (doc) => {
            const userId = ref(doc.userId);
            if (!userId) return null;
            return {
                id: id(doc),
                userId,
                apikey: doc.apikey,
                useWebP: doc.useWebP,
                webpOutputQuality: doc.webpOutputQuality,
                thumbnailWidth: doc.thumbnailWidth,
                thumbnailHeight: doc.thumbnailHeight,
            };
        },
    });

    await migrateCollection({
        label: "tusUploads",
        model: TusUploadModel,
        table: tusUploads,
        transform: (doc) => {
            // metadata/tempFilePath/isComplete are NOT NULL in Postgres;
            // legacy documents missing them are dead/incomplete uploads.
            if (!doc.metadata || !doc.tempFilePath) return null;
            return {
                id: id(doc),
                uploadId: doc.uploadId,
                userId: ref(doc.userId),
                apikey: doc.apikey,
                uploadLength: doc.uploadLength,
                uploadOffset: doc.uploadOffset ?? 0,
                metadata: doc.metadata,
                tempFilePath: doc.tempFilePath,
                isComplete: doc.isComplete ?? false,
                expiresAt: doc.expiresAt,
                signature: doc.signature,
                createdAt: doc.createdAt ?? now,
                updatedAt: doc.updatedAt ?? now,
            };
        },
    });

    await migrateCollection({
        label: "presignedUrls",
        model: PreSignedUrlModel,
        table: presignedUrls,
        // Expired presigned URLs are single-use/time-boxed; skip ones that
        // have already lapsed.
        filter: { validTill: { $gt: now } },
        transform: (doc) => {
            const userId = ref(doc.userId);
            if (!userId) return null;
            return {
                id: id(doc),
                userId,
                apikey: doc.apikey,
                signature: doc.signature,
                validTill: doc.validTill,
                group: doc.group,
                createdAt: doc.createdAt ?? now,
                updatedAt: doc.updatedAt ?? now,
            };
        },
    });

    await migrateCollection({
        label: "oauthClients",
        model: OauthClientModel,
        table: oauthClients,
        transform: (doc) => ({
            id: id(doc),
            clientId: doc.clientId,
            clientIdIssuedAt: doc.clientIdIssuedAt,
            redirectUris: doc.redirectUris ?? [],
            grantTypes: doc.grantTypes ?? [],
            tokenEndpointAuthMethod: doc.tokenEndpointAuthMethod ?? "none",
            clientName: doc.clientName,
            scope: doc.scope,
            createdAt: doc.createdAt ?? now,
            updatedAt: doc.updatedAt ?? now,
        }),
    });

    await migrateCollection({
        label: "oauthPendingAuths",
        model: OauthPendingAuthModel,
        table: oauthPendingAuths,
        // These are short-lived OTP/authorization flows; skip ones that
        // already expired rather than resurrecting dead sessions.
        filter: { expiresAt: { $gt: now } },
        transform: (doc) => ({
            id: id(doc),
            pendingId: doc.pendingId,
            clientId: doc.clientId,
            redirectUri: doc.redirectUri,
            codeChallenge: doc.codeChallenge,
            codeChallengeMethod: doc.codeChallengeMethod,
            state: doc.state,
            scope: doc.scope,
            email: doc.email,
            otpHash: doc.otpHash,
            otpExpires: doc.otpExpires,
            otpAttempts: doc.otpAttempts ?? 0,
            otpSentAt: doc.otpSentAt,
            expiresAt: doc.expiresAt,
            createdAt: doc.createdAt ?? now,
            updatedAt: doc.updatedAt ?? now,
        }),
    });

    await migrateCollection({
        label: "oauthRevokedTokens",
        model: OauthRevokedTokenModel,
        table: oauthRevokedTokens,
        // A revocation only matters until the underlying token would have
        // expired anyway; drop ones past that point.
        filter: { expiresAt: { $gt: now } },
        transform: (doc) => ({
            id: id(doc),
            jti: doc.jti,
            tokenType: doc.tokenType ?? "refresh_token",
            userId: doc.userId,
            clientId: doc.clientId,
            expiresAt: doc.expiresAt,
            revokedAt: doc.revokedAt ?? now,
            createdAt: doc.createdAt ?? now,
            updatedAt: doc.updatedAt ?? now,
        }),
    });

    await migrateCollection({
        label: "plans",
        model: PlanModel,
        table: plans,
        transform: (doc) => ({
            id: id(doc),
            maxFileSize: doc.maxFileSize,
            maxStorage: doc.maxStorage,
            createdAt: doc.createdAt ?? now,
            updatedAt: doc.updatedAt ?? now,
        }),
    });

    console.log("\n✨ Migration completed.");
}

migrate()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
        if (db) await closeDatabase();
    });
