import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { oauthRevokedTokens } from "../schema";
import type { NewOauthRevokedTokenRow, OauthRevokedTokenRow } from "../types";

export class OauthRevokedTokenRepository {
    constructor(private readonly db: Database) {}

    async findByJti(jti: string): Promise<OauthRevokedTokenRow | null> {
        const [row] = await this.db
            .select()
            .from(oauthRevokedTokens)
            .where(eq(oauthRevokedTokens.jti, jti))
            .limit(1);
        return row ?? null;
    }

    async insertIfNotExists(values: NewOauthRevokedTokenRow): Promise<void> {
        await this.db
            .insert(oauthRevokedTokens)
            .values(values)
            .onConflictDoNothing({ target: oauthRevokedTokens.jti });
    }
}
