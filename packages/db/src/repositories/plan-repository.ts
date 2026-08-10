import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { plans } from "../schema";
import type { PlanRow } from "../types";

export class PlanRepository {
    constructor(private readonly db: Database) {}

    async findById(id: string): Promise<PlanRow | null> {
        const [row] = await this.db
            .select()
            .from(plans)
            .where(eq(plans.id, id))
            .limit(1);
        return row ?? null;
    }
}
