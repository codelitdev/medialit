import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations",
);

export const MIGRATION_FILES = [
    "0000_auth.sql",
    "0001_domain.sql",
    "0002_billing.sql",
] as const;

export async function applyMigrations(
    exec: (sql: string) => Promise<unknown>,
): Promise<void> {
    for (const file of MIGRATION_FILES) {
        const sql = readFileSync(path.join(migrationDir, file), "utf8");
        for (const statement of sql.split("--> statement-breakpoint")) {
            const trimmed = statement.trim();
            if (trimmed) await exec(trimmed);
        }
    }
}
