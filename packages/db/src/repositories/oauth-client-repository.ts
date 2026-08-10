import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { oauthClients } from "../schema";
import type { NewOauthClientRow, OauthClientRow } from "../types";

export class OauthClientRepository {
    constructor(private readonly db: Database) {}

    async create(values: NewOauthClientRow): Promise<OauthClientRow> {
        const [row] = await this.db
            .insert(oauthClients)
            .values(values)
            .returning();
        return row;
    }

    async findByClientId(clientId: string): Promise<OauthClientRow | null> {
        const [row] = await this.db
            .select()
            .from(oauthClients)
            .where(eq(oauthClients.clientId, clientId))
            .limit(1);
        return row ?? null;
    }
}
