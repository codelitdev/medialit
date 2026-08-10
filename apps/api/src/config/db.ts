import {
    checkDatabaseConnection,
    createDatabase,
    type Database,
} from "../db/client";
import logger from "../services/log";
import { dbConnectionString } from "./constants";

let database: Database | undefined;

export default async function connectToDatabase(): Promise<void> {
    if (database) {
        return;
    }

    if (!dbConnectionString) {
        throw new Error("DB_CONNECTION_STRING is not defined");
    }

    try {
        database = createDatabase(dbConnectionString);
        await checkDatabaseConnection(database);
        logger.info("Database connected");
    } catch (err) {
        if (err instanceof Error) {
            logger.error({ err }, err.message);
        }
        database = undefined;
        throw err;
    }
}

export function getDb(): Database {
    if (!database) {
        throw new Error("Database has not been initialized");
    }
    return database;
}
