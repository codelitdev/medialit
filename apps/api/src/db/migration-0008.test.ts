import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../drizzle",
);

/** A copy of the migrations folder that stops before 0008. */
function migrationsBefore0008(): string {
    const folder = mkdtempSync(path.join(tmpdir(), "medialit-migrations-"));
    cpSync(migrationsFolder, folder, { recursive: true });
    const journalPath = path.join(folder, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.filter(
        (entry: { tag: string }) => entry.tag < "0008",
    );
    writeFileSync(journalPath, JSON.stringify(journal));
    return folder;
}

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

async function databaseAt0007() {
    const client = new PGlite();
    await migrate(drizzle(client), {
        migrationsFolder: migrationsBefore0008(),
    });
    const now = new Date().toISOString();
    await client.exec(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('u1', 'Owner', 'owner@example.com', true, '${now}', '${now}');
        INSERT INTO profiles (user_id, public_user_id, active) VALUES ('u1', 'pub-u1', true);
        INSERT INTO api_keys (id, key_id, name, key, user_id, is_default, deleted, created_at, updated_at)
        VALUES
            ('app-live', 'public-live', 'Live', 'legacy-live-secret', 'u1', true, false, '${now}', '${now}'),
            ('app-gone', 'public-gone', 'Gone', 'legacy-gone-secret', 'u1', false, true, '${now}', '${now}');
        INSERT INTO media (id, file_name, media_id, user_id, apikey, original_file_name, mime_type, size, created_at, updated_at)
        VALUES ('m1', 'f', 'media-1', 'u1', 'legacy-live-secret', 'a.png', 'image/png', 1, '${now}', '${now}');
        INSERT INTO media_settings (id, user_id, apikey) VALUES ('s1', 'u1', 'legacy-live-secret');
        INSERT INTO signatures (id, user_id, apikey, signature, valid_till, created_at)
        VALUES
            ('sig1', 'u1', 'legacy-live-secret', 'sig-live', '${now}', '${now}'),
            ('sig2', 'u1', 'no-such-key', 'sig-orphan', '${now}', '${now}');
        INSERT INTO tus_uploads (id, upload_id, user_id, apikey, upload_length, metadata, created_at, updated_at)
        VALUES
            ('t1', 'up-1', 'u1', 'legacy-live-secret', 1, '{}', '${now}', '${now}'),
            ('t2', 'up-2', 'u1', 'no-such-key', 1, '{}', '${now}', '${now}');
    `);
    return client;
}

describe("migration 0008_api_keys", () => {
    test("hashes legacy keys and re-keys tenant tables to the app", async () => {
        const client = await databaseAt0007();
        await migrate(drizzle(client), { migrationsFolder });

        const keys = await client.query<{
            app_id: string;
            key_hash: string;
            key_prefix: string;
            created_by_type: string;
            revoked_at: Date | null;
            api_key_id: string;
        }>(
            `SELECT app_id, key_hash, key_prefix, created_by_type, revoked_at, api_key_id FROM api_keys ORDER BY app_id`,
        );
        assert.equal(keys.rows.length, 2);
        const [gone, live] = keys.rows;
        assert.equal(live.app_id, "app-live");
        assert.equal(live.key_hash, sha256("legacy-live-secret"));
        assert.equal(live.key_prefix, "lega");
        assert.equal(live.created_by_type, "legacy");
        assert.equal(live.revoked_at, null);
        assert.match(live.api_key_id, /^ak_/);
        assert.equal(gone.app_id, "app-gone");
        assert.notEqual(gone.revoked_at, null);

        const appsRows = await client.query<Record<string, unknown>>(
            `SELECT * FROM apps WHERE id = 'app-live'`,
        );
        assert.equal(appsRows.rows[0].app_id, "public-live");
        assert.equal("key" in appsRows.rows[0], false);
        assert.equal("restriction" in appsRows.rows[0], false);

        const media = await client.query<{ app_id: string }>(
            `SELECT app_id FROM media`,
        );
        assert.deepEqual(media.rows, [{ app_id: "app-live" }]);
        const settings = await client.query<{ app_id: string }>(
            `SELECT app_id FROM media_settings`,
        );
        assert.deepEqual(settings.rows, [{ app_id: "app-live" }]);

        const signatures = await client.query<{
            signature: string;
            app_id: string;
            api_key_id: string;
        }>(`SELECT signature, app_id, api_key_id FROM signatures`);
        assert.equal(signatures.rows.length, 1, "orphaned signature deleted");
        assert.equal(signatures.rows[0].app_id, "app-live");
        const liveKeyId = await client.query<{ id: string }>(
            `SELECT id FROM api_keys WHERE app_id = 'app-live'`,
        );
        assert.equal(signatures.rows[0].api_key_id, liveKeyId.rows[0].id);

        const uploads = await client.query<{ upload_id: string }>(
            `SELECT upload_id FROM tus_uploads`,
        );
        assert.deepEqual(uploads.rows, [{ upload_id: "up-1" }]);

        const constraints = await client.query<{ conname: string }>(
            `SELECT conname FROM pg_constraint WHERE conrelid = 'public.apps'::regclass AND conname NOT LIKE 'apps\\_%\\_not\\_null' ESCAPE '\\' ORDER BY conname`,
        );
        assert.deepEqual(
            constraints.rows.map((row) => row.conname),
            ["apps_app_id_unique", "apps_pkey", "apps_user_id_user_id_fk"],
        );
        const leftovers = await client.query<{ name: string }>(
            `SELECT conname AS name FROM pg_constraint WHERE conrelid = 'public.apps'::regclass AND conname LIKE 'api\\_keys\\_%' ESCAPE '\\'
             UNION ALL
             SELECT indexname AS name FROM pg_indexes WHERE tablename = 'apps' AND indexname LIKE 'api\\_keys\\_%' ESCAPE '\\'`,
        );
        assert.deepEqual(
            leftovers.rows,
            [],
            "no api_keys_* names left on apps",
        );
    });

    test("refuses to drop media whose key matches no app", async () => {
        const client = await databaseAt0007();
        const now = new Date().toISOString();
        await client.exec(`
            INSERT INTO media (id, file_name, media_id, user_id, apikey, original_file_name, mime_type, size, created_at, updated_at)
            VALUES ('m2', 'f', 'media-2', 'u1', 'no-such-key', 'b.png', 'image/png', 1, '${now}', '${now}');
        `);
        await assert.rejects(
            migrate(drizzle(client), { migrationsFolder }),
            /media rows reference an API key that matches no app/,
        );
        const stillOld = await client.query<{ apikey: string }>(
            `SELECT apikey FROM media WHERE id = 'm2'`,
        );
        assert.equal(stillOld.rows[0].apikey, "no-such-key");
    });
});
