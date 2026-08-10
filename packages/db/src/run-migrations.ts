import { config as loadDotFile } from "dotenv";
loadDotFile();

import { createDatabase, closeDatabase } from "./client";
import { runMigrations } from "./migrate";

async function main() {
    const connectionString = process.env.DB_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error("DB_CONNECTION_STRING is not set");
    }

    const db = createDatabase(connectionString);
    await runMigrations(db);
    await closeDatabase();
     
    console.log("Migrations applied successfully");
}

main().catch((err) => {
     
    console.error(err);
    process.exit(1);
});
