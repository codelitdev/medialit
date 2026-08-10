import path from "path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client";

const migrationsFolder = path.join(__dirname, "..", "drizzle");

export async function runMigrations(db: Database): Promise<void> {
    await migrate(db, { migrationsFolder });
}
