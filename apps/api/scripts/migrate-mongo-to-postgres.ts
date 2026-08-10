/**
 * One-time data migration: copies every record out of the legacy MongoDB
 * database and inserts it into the Postgres database owned by apps/api.
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
 * The source application must be in read-only/maintenance mode. Re-running
 * the script converges rows by primary key and fails loudly on unrelated
 * unique-key conflicts instead of silently hiding them.
 */

import { config as loadDotFile } from "dotenv";
import { createHash } from "node:crypto";
import path from "path";
import mongoose from "mongoose";
import { getTableColumns, sql } from "drizzle-orm";
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
    oauthProviderClients,
    plans,
    logs,
    type Database,
} from "../src/db";

loadDotFile({ path: path.resolve(__dirname, "../.env") });

const MONGO_CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING;
const PG_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;
const isDryRun = process.argv.includes("--dry-run");
const sourceReadOnlyConfirmed = process.argv.includes(
    "--confirm-source-read-only",
);
const BATCH_SIZE = 500;

const usage = `
Usage:
  pnpm --filter @medialit/api db:migrate:mongo [flags]

Flags:
  --dry-run                       Validate and count without Postgres writes.
  --confirm-source-read-only      Required for writes. Confirms all MongoDB
                                  writers have been stopped for cutover.

Required Environment Variables:
  MONGO_CONNECTION_STRING   MongoDB connection string (source).
  DB_CONNECTION_STRING      Postgres connection string (destination).
`;

if (
    !MONGO_CONNECTION_STRING ||
    (!isDryRun && !PG_CONNECTION_STRING) ||
    (!isDryRun && !sourceReadOnlyConfirmed)
) {
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
const PlanModel = mongoose.model(
    "Plan",
    new mongoose.Schema({}, { strict: false, timestamps: true }),
);
const LogModel = mongoose.model(
    "Log",
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

function requiredRef(value: unknown, field: string, doc: AnyDoc): string {
    const result = ref(value);
    if (!result) {
        throw new Error(`${field} is missing on source document ${id(doc)}`);
    }
    return result;
}

function validateRequiredColumns(table: any, row: AnyDoc): void {
    for (const [key, column] of Object.entries(getTableColumns(table))) {
        const definition = column as {
            notNull?: boolean;
            hasDefault?: boolean;
        };
        if (
            definition.notNull &&
            !definition.hasDefault &&
            (row[key] === undefined || row[key] === null)
        ) {
            throw new Error(
                `${table[Symbol.for("drizzle:Name")] ?? "table"}.${key} is required for source document ${row.id}`,
            );
        }
    }
}

function excludedColumnValues(table: any): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(getTableColumns(table))
            .filter(([key]) => key !== "id")
            .map(([key, column]) => [
                key,
                sql.raw(`excluded."${(column as { name: string }).name}"`),
            ]),
    );
}

async function migrateCollection<TDoc extends AnyDoc>({
    label,
    model,
    table,
    transform,
}: {
    label: string;
    model: mongoose.Model<any>;
    table: any;
    transform: (doc: TDoc) => AnyDoc;
}): Promise<{ migrated: number; total: number }> {
    const total = await model.countDocuments();
    console.log(`\n📦 ${label}: ${total} document(s) found`);

    let migrated = 0;
    let batch: AnyDoc[] = [];
    const sourceHash = createHash("sha256");

    const flush = async () => {
        if (batch.length === 0) return;
        if (!isDryRun) {
            const written = await db!
                .insert(table)
                .values(batch)
                .onConflictDoUpdate({
                    target: table.id,
                    set: excludedColumnValues(table),
                })
                .returning({ id: table.id });
            if (written.length !== batch.length) {
                throw new Error(
                    `${label}: expected ${batch.length} writes, received ${written.length}`,
                );
            }
        }
        migrated += batch.length;
        batch = [];
    };

    const cursor = model.find().sort({ _id: 1 }).lean().cursor();
    for (
        let doc = await cursor.next();
        doc != null;
        doc = await cursor.next()
    ) {
        sourceHash.update(JSON.stringify(doc));
        const row = transform(doc as TDoc);
        validateRequiredColumns(table, row);
        batch.push(row);
        if (batch.length >= BATCH_SIZE) {
            await flush();
            console.log(`  ⏳ ${migrated}/${total} migrated...`);
        }
    }
    await flush();

    const finalSourceCount = await model.countDocuments();
    if (finalSourceCount !== total) {
        throw new Error(
            `${label}: source changed during migration (${total} -> ${finalSourceCount}); keep MongoDB read-only and rerun`,
        );
    }
    if (migrated !== total) {
        throw new Error(
            `${label}: validated ${migrated} of ${total} documents`,
        );
    }

    const verificationHash = createHash("sha256");
    const verificationCursor = model.find().sort({ _id: 1 }).lean().cursor();
    for (
        let doc = await verificationCursor.next();
        doc != null;
        doc = await verificationCursor.next()
    ) {
        verificationHash.update(JSON.stringify(doc));
    }
    if (sourceHash.digest("hex") !== verificationHash.digest("hex")) {
        throw new Error(
            `${label}: source documents changed during migration; keep MongoDB read-only and rerun`,
        );
    }

    console.log(
        `  ✅ ${migrated} ${isDryRun ? "validated" : "upserted"} (${label})`,
    );
    return { migrated, total };
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
            const userId = requiredRef(doc.userId, "userId", doc);
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
            const userId = requiredRef(doc.userId, "userId", doc);
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
                temp: doc.temp ?? true,
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
            const userId = requiredRef(doc.userId, "userId", doc);
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
            return {
                id: id(doc),
                uploadId: doc.uploadId,
                userId: requiredRef(doc.userId, "userId", doc),
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
        transform: (doc) => {
            const userId = requiredRef(doc.userId, "userId", doc);
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
        table: oauthProviderClients,
        transform: (doc) => ({
            id: id(doc),
            clientId: doc.clientId,
            name: doc.clientName,
            scopes:
                typeof doc.scope === "string" && doc.scope.trim()
                    ? doc.scope.trim().split(/\s+/)
                    : ["openid", "profile", "email", "offline_access"],
            redirectUris: doc.redirectUris ?? [],
            grantTypes: doc.grantTypes ?? ["authorization_code"],
            responseTypes: ["code"],
            tokenEndpointAuthMethod: doc.tokenEndpointAuthMethod ?? "none",
            public: true,
            requirePKCE: true,
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

    await migrateCollection({
        label: "logs",
        model: LogModel,
        table: logs,
        transform: (doc) => ({
            id: id(doc),
            severity: doc.severity,
            message: doc.message,
            metadata: doc.metadata,
            createdAt: doc.createdAt ?? now,
            updatedAt: doc.updatedAt ?? doc.createdAt ?? now,
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
