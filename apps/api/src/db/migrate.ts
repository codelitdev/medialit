import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, createDatabase, type Database } from "./client";

function findMigrationsFolder(): string {
    let directory = __dirname;
    while (true) {
        const candidate = path.join(directory, "drizzle");
        if (fs.existsSync(path.join(candidate, "meta", "_journal.json"))) {
            return candidate;
        }

        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }

    throw new Error("Could not find the Drizzle migrations directory");
}

export async function runMigrations(db: Database): Promise<void> {
    await migrate(db, { migrationsFolder: findMigrationsFolder() });
}

async function main(): Promise<void> {
    const connectionString = process.env.DB_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error("DB_CONNECTION_STRING is not set");
    }

    const database = createDatabase(connectionString);
    await runMigrations(database);
    await closeDatabase();
    console.log("Migrations applied successfully");
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
