import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type AppDb = NodePgDatabase<typeof schema>;

let database: AppDb | null = null;
let pool: pg.Pool | null = null;

export function setDb(next: AppDb): void {
    database = next;
}

export function getDb(): AppDb {
    if (database) return database;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
    }
    pool = new pg.Pool({ connectionString });
    database = drizzle(pool, { schema });
    return database;
}

export async function closeDb(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
    database = null;
}
