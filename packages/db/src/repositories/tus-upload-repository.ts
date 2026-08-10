import { desc, eq, lt } from "drizzle-orm";
import type { Database } from "../client";
import { tusUploads } from "../schema";
import type { NewTusUploadRow, TusUploadRow } from "../types";

export class TusUploadRepository {
    constructor(private readonly db: Database) {}

    async create(values: NewTusUploadRow): Promise<TusUploadRow> {
        const [row] = await this.db
            .insert(tusUploads)
            .values(values)
            .returning();
        return row;
    }

    async findByUploadId(uploadId: string): Promise<TusUploadRow | null> {
        const [row] = await this.db
            .select()
            .from(tusUploads)
            .where(eq(tusUploads.uploadId, uploadId))
            .limit(1);
        return row ?? null;
    }

    async updateOffset(uploadId: string, uploadOffset: number): Promise<void> {
        await this.db
            .update(tusUploads)
            .set({ uploadOffset })
            .where(eq(tusUploads.uploadId, uploadId));
    }

    async markComplete(uploadId: string): Promise<void> {
        await this.db
            .update(tusUploads)
            .set({ isComplete: true })
            .where(eq(tusUploads.uploadId, uploadId));
    }

    async deleteByUploadId(uploadId: string): Promise<void> {
        await this.db
            .delete(tusUploads)
            .where(eq(tusUploads.uploadId, uploadId));
    }

    async deleteById(id: string): Promise<void> {
        await this.db.delete(tusUploads).where(eq(tusUploads.id, id));
    }

    async findByUserId(userId: string): Promise<TusUploadRow[]> {
        return this.db
            .select()
            .from(tusUploads)
            .where(eq(tusUploads.userId, userId))
            .orderBy(desc(tusUploads.createdAt));
    }

    async findExpired(now: Date): Promise<TusUploadRow[]> {
        return this.db
            .select()
            .from(tusUploads)
            .where(lt(tusUploads.expiresAt, now));
    }
}
