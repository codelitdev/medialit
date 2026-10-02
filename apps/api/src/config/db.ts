import { applyMigrations } from "@/db";
import pg from "pg";
import logger from "../services/log";

export default async function connectToDatabase(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
    }
    const pool = new pg.Pool({ connectionString });
    try {
        await applyMigrations(async (statement) => {
            await pool.query(statement);
        });
        logger.info("Database migrated");
    } finally {
        await pool.end();
    }
}

export async function disconnect(): Promise<void> {
    const { closeDb } = await import("@/db");
    await closeDb();
}
