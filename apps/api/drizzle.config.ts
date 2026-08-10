import { config as loadDotFile } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadDotFile();

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DB_CONNECTION_STRING || "",
    },
});
