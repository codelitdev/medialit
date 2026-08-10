import type { Database } from "../client";
import { logs } from "../schema";
import type { LogRow, NewLogRow } from "../types";

export class LogRepository {
    constructor(private readonly db: Database) {}

    async create(values: NewLogRow): Promise<LogRow> {
        const [row] = await this.db.insert(logs).values(values).returning();
        return row;
    }
}
