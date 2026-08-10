import { and, eq, lt } from "drizzle-orm";
import type { Database } from "../client";
import { presignedUrls } from "../schema";
import type { NewPresignedUrlRow, PresignedUrlRow } from "../types";

export class PresignedUrlRepository {
    constructor(private readonly db: Database) {}

    async create(values: NewPresignedUrlRow): Promise<PresignedUrlRow> {
        const [row] = await this.db
            .insert(presignedUrls)
            .values(values)
            .returning();
        return row;
    }

    async findBySignature(signature: string): Promise<PresignedUrlRow | null> {
        const [row] = await this.db
            .select()
            .from(presignedUrls)
            .where(eq(presignedUrls.signature, signature))
            .limit(1);
        return row ?? null;
    }

    async deleteById(id: string): Promise<void> {
        await this.db.delete(presignedUrls).where(eq(presignedUrls.id, id));
    }

    async deleteBySignature(signature: string): Promise<void> {
        await this.db
            .delete(presignedUrls)
            .where(eq(presignedUrls.signature, signature));
    }

    async deleteExpiredByUserId(userId: string, now: Date): Promise<void> {
        await this.db
            .delete(presignedUrls)
            .where(
                and(
                    eq(presignedUrls.userId, userId),
                    lt(presignedUrls.validTill, now),
                ),
            );
    }
}
