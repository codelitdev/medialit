/**
 * A fresh, migrated Postgres database for tests that need real Postgres
 * (row locks, SKIP LOCKED, LISTEN/NOTIFY), which PGlite can't provide.
 * Set JOBS_TEST_DATABASE_URL to a server where the user may create
 * databases; `bun run test:integration:stack` does. Without it, the
 * tests are skipped.
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "../db/schema/index.js";
import type { AppDb } from "../db/client.js";

export const testPostgresUrl = process.env.JOBS_TEST_DATABASE_URL;

export type TestPostgres = {
    url: string;
    db: AppDb;
    drop: () => Promise<void>;
};

export async function createTestPostgres(admin: string): Promise<TestPostgres> {
    const name = `medialit_test_${randomBytes(6).toString("hex")}`;
    const adminPool = new pg.Pool({ connectionString: admin, max: 1 });
    await adminPool.query(`CREATE DATABASE ${name}`);
    const url = new URL(admin);
    url.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: url.toString(), max: 20 });
    // DROP DATABASE … WITH (FORCE) ends connections that are still closing.
    pool.on("error", () => undefined);
    const db = drizzle(pool, { schema }) as AppDb;
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../drizzle",
        ),
    });
    return {
        url: url.toString(),
        db,
        drop: async () => {
            await pool.end();
            await adminPool.query(
                `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`,
            );
            await adminPool.end();
        },
    };
}
