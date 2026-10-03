import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import logger from "../services/log";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    logger.error("DATABASE_URL is not set");
    process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder =
    process.env.MIGRATIONS_FOLDER ||
    (existsSync(path.resolve("apps/api/drizzle"))
        ? path.resolve("apps/api/drizzle")
        : path.resolve(here, "../../drizzle"));

const pool = new pg.Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

migrate(db, { migrationsFolder })
    .then(() => {
        logger.info({ migrationsFolder }, "Database migrations applied");
    })
    .catch((err) => {
        logger.error(
            { error: err instanceof Error ? err.message : String(err) },
            "Failed to apply database migrations",
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
