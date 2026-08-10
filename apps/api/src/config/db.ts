import { createDatabase, runMigrations, type Database } from "@medialit/db";
import logger from "../services/log";
import { dbConnectionString } from "./constants";

let database: Database | undefined;

export default async function connectToDatabase(): Promise<void> {
    if (database) {
        return;
    }

    if (!dbConnectionString) {
        logger.error("DB_CONNECTION_STRING is not defined");
        process.exit(1);
    }

    try {
        database = createDatabase(dbConnectionString);
        await runMigrations(database);
        logger.info("Database connected");
    } catch (err) {
        if (err instanceof Error) {
            logger.error({ err }, err.message);
        }
        process.exit(1);
    }
}

export function getDb(): Database {
    if (!database) {
        throw new Error("Database has not been initialized");
    }
    return database;
}
