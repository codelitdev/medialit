import pg from "pg";
import logger from "../services/log";

export async function checkDatabaseConnection(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
    }
    const pool = new pg.Pool({ connectionString });
    try {
        await pool.query("select 1");
        logger.info("Database connected");
    } finally {
        await pool.end();
    }
}
