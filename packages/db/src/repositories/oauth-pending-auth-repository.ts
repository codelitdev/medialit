import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { oauthPendingAuths } from "../schema";
import type { NewOauthPendingAuthRow, OauthPendingAuthRow } from "../types";

export class OauthPendingAuthRepository {
    constructor(private readonly db: Database) {}

    async create(values: NewOauthPendingAuthRow): Promise<OauthPendingAuthRow> {
        const [row] = await this.db
            .insert(oauthPendingAuths)
            .values(values)
            .returning();
        return row;
    }

    async findValidByPendingId(
        pendingId: string,
        now: Date,
    ): Promise<OauthPendingAuthRow | null> {
        const [row] = await this.db
            .select()
            .from(oauthPendingAuths)
            .where(
                and(
                    eq(oauthPendingAuths.pendingId, pendingId),
                    gt(oauthPendingAuths.expiresAt, now),
                ),
            )
            .limit(1);
        return row ?? null;
    }

    async updateOtp(
        pendingId: string,
        values: {
            email: string;
            otpHash: string;
            otpExpires: Date;
            otpSentAt: Date;
        },
    ): Promise<void> {
        await this.db
            .update(oauthPendingAuths)
            .set({ ...values, otpAttempts: 0 })
            .where(eq(oauthPendingAuths.pendingId, pendingId));
    }

    async incrementOtpAttempts(
        pendingId: string,
        now: Date,
    ): Promise<OauthPendingAuthRow | null> {
        const [row] = await this.db
            .update(oauthPendingAuths)
            .set({ otpAttempts: sql`${oauthPendingAuths.otpAttempts} + 1` })
            .where(
                and(
                    eq(oauthPendingAuths.pendingId, pendingId),
                    gt(oauthPendingAuths.expiresAt, now),
                ),
            )
            .returning();
        return row ?? null;
    }

    async deleteByPendingId(pendingId: string): Promise<void> {
        await this.db
            .delete(oauthPendingAuths)
            .where(eq(oauthPendingAuths.pendingId, pendingId));
    }
}
