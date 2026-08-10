/**
 * This script migrates the media files from the old bucket structure to the new dual-bucket architecture.
 *
 * It copies the files from the source bucket to the new private and public buckets.
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import {
    S3Client,
    CopyObjectCommand,
    HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Constants, PathKey } from "@medialit/models";

// Load environment variables from local .env config
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// The Mongo `Media` collection has been retired in favor of Postgres (see
// API database layer). This script only needs to read a handful of fields off the
// legacy documents, so it declares its own loose, read-only schema rather
// than depending on the (now removed) shared mongoose schema.
const LegacyMediaSchema = new mongoose.Schema(
    {
        mediaId: String,
        fileName: String,
        accessControl: String,
        thumbnailGenerated: Boolean,
    },
    { strict: false },
);
const MediaModel = mongoose.model("Media", LegacyMediaSchema);

const SOURCE_BUCKET = process.env.SOURCE_BUCKET_NAME;
const PRIVATE_BUCKET = process.env.CLOUD_BUCKET_NAME;
const PUBLIC_BUCKET = process.env.CLOUD_PUBLIC_BUCKET_NAME;
const REGION = process.env.CLOUD_REGION;
const CLOUD_KEY = process.env.CLOUD_KEY;
const CLOUD_SECRET = process.env.CLOUD_SECRET;
const CLOUD_ENDPOINT = process.env.CLOUD_ENDPOINT;
const PATH_PREFIX = process.env.PATH_PREFIX;
const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// Check for dry-run flag
const isDryRun = process.argv.includes("--dry-run");

const usage = `
Usage:
  pnpm migrate:dual_bucket_architecture [flags]

Flags:
  --dry-run    Simulate the migration without copying files.

Required Environment Variables:
  SOURCE_BUCKET_NAME           Name of the source bucket.
  CLOUD_BUCKET_NAME            Name of the destination private bucket.
  CLOUD_PUBLIC_BUCKET_NAME     Name of the destination public bucket.
  DB_CONNECTION_STRING         MongoDB connection string.
  CLOUD_KEY, CLOUD_SECRET      AWS/S3 credentials.
  CLOUD_REGION, CLOUD_ENDPOINT AWS/S3 configuration.
`;

if (
    !SOURCE_BUCKET ||
    !PRIVATE_BUCKET ||
    !PUBLIC_BUCKET ||
    !CLOUD_KEY ||
    !CLOUD_SECRET ||
    !CLOUD_ENDPOINT ||
    !DB_CONNECTION_STRING
) {
    console.error("❌ Error: Missing required environment variables.");
    console.error(usage);
    process.exit(1);
}

const s3Client = new S3Client({
    region: REGION,
    endpoint: CLOUD_ENDPOINT,
    credentials: {
        accessKeyId: CLOUD_KEY!,
        secretAccessKey: CLOUD_SECRET!,
    },
    forcePathStyle: true, // Often needed for non-AWS S3
});

// New key generator (using i/p)
function generateDestKey({
    mediaId,
    path: pathKey,
    filename,
}: {
    mediaId: string;
    path: PathKey;
    filename: string;
}) {
    return `${PATH_PREFIX ? `${PATH_PREFIX}/` : ""}${pathKey}/${mediaId}/${filename}`;
}

// Old key generator (using private/public)
function generateSourceKey({
    mediaId,
    filename,
    access,
}: {
    mediaId: string;
    filename: string;
    access: string;
}) {
    const pathKey = access === "private" ? "private" : "public";
    return `${PATH_PREFIX ? `${PATH_PREFIX}/` : ""}${pathKey}/${mediaId}/${filename}`;
}

async function copyFile(
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string,
) {
    const filename = path.basename(sourceKey);
    if (isDryRun) {
        console.log(`  ├── 📄 ${filename}`);
        console.log(`      FROM: ${sourceKey}`);
        console.log(`      TO:   ${destinationKey} (🪣  ${destinationBucket})`);
        return;
    }

    try {
        // Check if source exists
        try {
            await s3Client.send(
                new HeadObjectCommand({
                    Bucket: SOURCE_BUCKET!,
                    Key: sourceKey,
                }),
            );
        } catch (e: any) {
            if (e.name === "NotFound") {
                console.log(`  ├── ⏭️  [SKIP] Source not found: ${filename}`);
                return;
            }
            throw e;
        }

        // Copy
        // Note: CopyObjectCommand input requires CopySource to be URL encoded "Bucket/Key"
        const copySource = encodeURI(`${SOURCE_BUCKET!}/${sourceKey}`);

        await s3Client.send(
            new CopyObjectCommand({
                Bucket: destinationBucket,
                CopySource: copySource,
                Key: destinationKey,
            }),
        );
        console.log(`  ├── ✅ [OK] Copied ${filename}`);
    } catch (error: any) {
        console.error(
            `  ├── ❌ [ERROR] Failed to copy ${filename}: ${error.message}`,
        );
    }
}

async function migrate() {
    console.log("🚀 Starting migration...");
    console.log("🔌 Connecting to Database...");
    await mongoose.connect(DB_CONNECTION_STRING!);
    console.log("✅ Connected to Database.");

    if (isDryRun) {
        console.log("⚠️  DRY RUN MODE ENABLED - NO CHANGES WILL BE MADE");
    }

    console.log(`ℹ️  Source Bucket: ${SOURCE_BUCKET}`);
    console.log(`ℹ️  Target Private: ${PRIVATE_BUCKET}`);
    console.log(`ℹ️  Target Public: ${PUBLIC_BUCKET}`);

    const cursor = MediaModel.find({ temp: { $ne: true } }).cursor(); // Iterate non-temp media

    let processed = 0;
    for (
        let mediaWait = await cursor.next();
        mediaWait != null;
        mediaWait = await cursor.next()
    ) {
        const media = mediaWait as any;
        processed++;
        if (processed % 100 === 0)
            console.log(`⏳ Processed ${processed} records...`);

        const icon = media.accessControl === "private" ? "🔒" : "🌍";
        console.log(`${icon} Media: ${media.mediaId}`);

        const fileExtension = path.extname(media.fileName).replace(".", "");

        // 1. Thumbnails
        if (media.thumbnailGenerated) {
            const oldKey = generateSourceKey({
                mediaId: media.mediaId,
                filename: "thumb.webp",
                access: "public",
            });

            const newKey = generateDestKey({
                mediaId: media.mediaId,
                path: Constants.PathKey.PUBLIC,
                filename: "thumb.webp",
            });

            await copyFile(oldKey, PUBLIC_BUCKET!, newKey);
        }

        // 2. Main File
        const mainFilename = `main.${fileExtension}`;
        const oldMainKey = generateSourceKey({
            mediaId: media.mediaId,
            filename: mainFilename,
            access: media.accessControl,
        });

        if (media.accessControl !== "private") {
            const newMainKey = generateDestKey({
                mediaId: media.mediaId,
                path: Constants.PathKey.PUBLIC,
                filename: mainFilename,
            });
            await copyFile(oldMainKey, PUBLIC_BUCKET!, newMainKey);
        } else {
            const newMainKey = generateDestKey({
                mediaId: media.mediaId,
                path: Constants.PathKey.PRIVATE,
                filename: mainFilename,
            });
            await copyFile(oldMainKey, PRIVATE_BUCKET!, newMainKey);
        }
    }

    console.log("✨ Migration completed.");
    process.exit(0);
}

migrate().catch((err) => {
    console.error(err);
    process.exit(1);
});
