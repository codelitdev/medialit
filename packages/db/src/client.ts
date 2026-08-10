import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let sqlClient: postgres.Sql | undefined;
let db: Database | undefined;

export function createDatabase(connectionString: string): Database {
    if (db) {
        return db;
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

export async function closeDatabase(): Promise<void> {
    if (sqlClient) {
        await sqlClient.end();
        sqlClient = undefined;
        db = undefined;
    }
}
