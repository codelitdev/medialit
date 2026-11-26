import assert from "node:assert/strict";
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

/** A copy of the migrations folder that stops before 0015. */
function migrationsBefore0015(): string {
    const folder = mkdtempSync(path.join(tmpdir(), "medialit-migrations-"));
    cpSync(migrationsFolder, folder, { recursive: true });
    const journalPath = path.join(folder, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.filter(
        (entry: { tag: string }) => entry.tag < "0015",
    );
    writeFileSync(journalPath, JSON.stringify(journal));
    return folder;
}

describe("migration 0015_video_settings", () => {
    test("turns video streaming off for every existing app and keeps its other settings", async () => {
        const client = new PGlite();
        await migrate(drizzle(client), {
            migrationsFolder: migrationsBefore0015(),
        });
        const now = new Date().toISOString();
        await client.exec(`
            INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
            VALUES ('u1', 'Owner', 'owner@example.com', true, '${now}', '${now}');
            INSERT INTO apps (id, app_id, name, user_id, deleted, is_default, created_at, updated_at)
            VALUES
                ('a-set', 'pub-set', 'With settings', 'u1', false, true, '${now}', '${now}'),
                ('a-none', 'pub-none', 'No settings', 'u1', false, false, '${now}', '${now}'),
                ('a-gone', 'pub-gone', 'Deleted', 'u1', true, false, '${now}', '${now}');
            INSERT INTO media_settings (id, user_id, app_id, use_web_p, webp_output_quality, thumbnail_width, thumbnail_height)
            VALUES ('s1', 'u1', 'a-set', true, 80, 300, 200);
        `);

        await migrate(drizzle(client), { migrationsFolder });

        const rows = await client.query<{
            app_id: string;
            video_streaming: string | null;
            hls_renditions: string[] | null;
            use_web_p: boolean | null;
            webp_output_quality: string | null;
            thumbnail_width: string | null;
        }>(
            `SELECT app_id, video_streaming, hls_renditions, use_web_p,
                webp_output_quality::text, thumbnail_width::text
             FROM media_settings ORDER BY app_id`,
        );
        assert.deepEqual(
            rows.rows.map((r) => [r.app_id, r.video_streaming]),
            [
                ["a-none", "off"],
                ["a-set", "off"],
            ],
            "a deleted app gets no row",
        );
        const kept = rows.rows.find((r) => r.app_id === "a-set")!;
        assert.equal(kept.use_web_p, true);
        assert.equal(kept.webp_output_quality, "80");
        assert.equal(kept.thumbnail_width, "300");
        assert.equal(kept.hls_renditions, null);
        // A row the migration added holds nothing but the setting.
        const added = rows.rows.find((r) => r.app_id === "a-none")!;
        assert.equal(added.use_web_p, null);
        assert.equal(added.thumbnail_width, null);

        // An app created after the migration has no row: the plan decides.
        await client.exec(`
            INSERT INTO apps (id, app_id, name, user_id, deleted, is_default, created_at, updated_at)
            VALUES ('a-new', 'pub-new', 'New', 'u1', false, false, '${now}', '${now}');
        `);
        const fresh = await client.query(
            `SELECT 1 FROM media_settings WHERE app_id = 'a-new'`,
        );
        assert.equal(fresh.rows.length, 0);
    });
});
