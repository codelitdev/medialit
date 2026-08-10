import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import mongoose from "mongoose";
import { eq } from "drizzle-orm";
import {
    closeDatabase,
    createDatabase,
    createRepositories,
    logs,
    presignedUrls,
    runMigrations,
    tusUploads,
} from "./index";

const execFileAsync = promisify(execFile);
const mongoUrl =
    process.env.MONGO_TEST_CONNECTION_STRING ??
    "mongodb://localhost:27017/medialit_migration_test";
const postgresUrl =
    process.env.DB_CONNECTION_STRING ??
    "postgres://postgres:postgres@localhost:5432/medialit_test";
const suffix = `${process.pid}-${Date.now()}`;
const ids = {
    log: `migration-log-${suffix}`,
    presigned: `migration-presigned-${suffix}`,
    tus: `migration-tus-${suffix}`,
};

async function runMigration(...args: string[]) {
    return execFileAsync(
        process.execPath,
        [
            "--import",
            "tsx",
            path.resolve("scripts/migrate-mongo-to-postgres.ts"),
            ...args,
        ],
        {
            cwd: path.resolve(__dirname, "..", ".."),
            env: {
                ...process.env,
                MONGO_CONNECTION_STRING: mongoUrl,
                DB_CONNECTION_STRING: postgresUrl,
            },
            timeout: 60_000,
        },
    );
}

test(
    "migration copies every legacy record and converges on rerun",
    { timeout: 90_000 },
    async () => {
        await mongoose.connect(mongoUrl);
        const source = mongoose.connection.db;
        assert.ok(source);
        const expired = new Date(Date.now() - 60_000);

        await Promise.all([
            source.collection("logs").insertOne({
                _id: ids.log,
                severity: "info",
                message: "first value",
                metadata: { origin: "migration-test" },
                createdAt: expired,
                updatedAt: expired,
            }),
            source.collection("tusuploads").insertOne({
                _id: ids.tus,
                uploadId: `upload-${suffix}`,
                userId: `user-${suffix}`,
                apikey: `key-${suffix}`,
                uploadLength: 42,
                uploadOffset: 0,
                isComplete: false,
                createdAt: expired,
                updatedAt: expired,
            }),
            source.collection("presignedurls").insertOne({
                _id: ids.presigned,
                userId: `user-${suffix}`,
                apikey: `key-${suffix}`,
                signature: `signature-${suffix}`,
                validTill: expired,
                createdAt: expired,
                updatedAt: expired,
            }),
        ]);
        await mongoose.disconnect();

        await assert.rejects(runMigration(), /confirm-source-read-only/);
        await runMigration("--confirm-source-read-only");

        await mongoose.connect(mongoUrl);
        await mongoose.connection
            .db!.collection("logs")
            .updateOne(
                { _id: ids.log },
                { $set: { message: "updated value" } },
            );
        await mongoose.disconnect();
        await runMigration("--confirm-source-read-only");

        const db = createDatabase(postgresUrl);
        await runMigrations(db);
        const repositories = createRepositories(db);
        const [logRow] = await db
            .select()
            .from(logs)
            .where(eq(logs.id, ids.log));
        const [tusRow] = await db
            .select()
            .from(tusUploads)
            .where(eq(tusUploads.id, ids.tus));
        const [presignedRow] = await db
            .select()
            .from(presignedUrls)
            .where(eq(presignedUrls.id, ids.presigned));

        assert.equal(logRow?.message, "updated value");
        assert.equal(tusRow?.metadata, null);
        assert.equal(tusRow?.tempFilePath, null);
        assert.ok(presignedRow);

        await repositories.apikeys.create({
            id: `apikey-${suffix}`,
            keyId: `key-id-${suffix}`,
            key: `secret-${suffix}`,
            name: "Public projection",
            userId: `user-${suffix}`,
        });
        const [publicKey] = await repositories.apikeys.findPublicManyByUserId(
            `user-${suffix}`,
        );
        assert.ok(publicKey);
        assert.deepEqual(Object.keys(publicKey).sort(), [
            "createdAt",
            "default",
            "httpReferrers",
            "ipAddresses",
            "keyId",
            "name",
            "updatedAt",
        ]);
        assert.equal("key" in publicKey, false);
        await closeDatabase();
    },
);
