import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let sqlClient: postgres.Sql | undefined;
let db: Database | undefined;

export function createDatabase(connectionString: string): Database {
    if (db) {
        return db;
    }

    let protocol: string;
    try {
        protocol = new URL(connectionString).protocol;
    } catch {
        throw new Error("DB_CONNECTION_STRING must be a valid Postgres URL");
    }
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
        throw new Error(
            "DB_CONNECTION_STRING must use the postgres:// or postgresql:// protocol",
        );
    }

    sqlClient = postgres(connectionString);
    db = drizzle(sqlClient, { schema });
    return db;
}

export function getDatabase(): Database {
    if (!db) {
        throw new Error(
            "Database has not been initialized. Call createDatabase() first.",
        );
    }
    return db;
}

export async function checkDatabaseConnection(
    database: Database = getDatabase(),
): Promise<void> {
    await database.execute(sql`select 1`);
}

export async function closeDatabase(): Promise<void> {
    if (sqlClient) {
        await sqlClient.end();
        sqlClient = undefined;
        db = undefined;
    }
}
