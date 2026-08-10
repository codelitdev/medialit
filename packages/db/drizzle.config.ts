import { config as loadDotFile } from "dotenv";
import type { Config } from "drizzle-kit";

loadDotFile();

export default {
    schema: "./src/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DB_CONNECTION_STRING || "",
    },
} satisfies Config;
