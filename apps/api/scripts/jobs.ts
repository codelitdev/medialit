/** Operator CLI for the job queue; see `src/jobs/operator-cli.ts` and the
 * self-hosting guide's "Operate the job queue" section. */
import { closeDb, getDb } from "../src/db";
import { runJobsCli } from "../src/jobs/operator-cli";

async function main() {
    let code = 1;
    try {
        code = await runJobsCli(process.argv.slice(2), {
            // Connects on first use, so `jobs help` needs no database.
            db: { execute: (query) => getDb().execute(query) },
            out: (line) => console.log(line),
            err: (line) => console.error(line),
        });
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
    } finally {
        await closeDb();
    }
    process.exit(code);
}

void main();
