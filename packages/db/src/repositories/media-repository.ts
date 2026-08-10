import { and, desc, eq, like, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { media } from "../schema";
import type { MediaRow, NewMediaRow } from "../types";

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, "\\$&");
}

// `temp` is nullable (cleared to NULL once media is sealed). Under SQL's
// three-valued logic, `temp <> true` excludes NULL rows, unlike Mongo's
// `{ temp: { $ne: true } }`. `IS NOT TRUE` treats NULL as "not true".
function notTemp() {
    return sql`${media.temp} IS NOT TRUE`;
}

export interface MediaFilter {
    userId: string;
    apikey: string;
    access?: "private" | "public";
    group?: string;
}

function buildFilterConditions(filter: MediaFilter) {
    const conditions = [
        eq(media.userId, filter.userId),
        eq(media.apikey, filter.apikey),
        notTemp(),
    ];
    if (filter.access) {
        conditions.push(eq(media.accessControl, filter.access));
    }
    if (typeof filter.group === "string" && filter.group.trim().length > 0) {
        conditions.push(
            like(media.group, `${escapeLike(filter.group.trim())}%`),
        );
    }
    return conditions;
}

export class MediaRepository {
    constructor(private readonly db: Database) {}

    async create(values: NewMediaRow): Promise<MediaRow> {
        const [row] = await this.db.insert(media).values(values).returning();
        return row;
    }

    async findOne({
        userId,
        apikey,
        mediaId,
    }: {
        userId: string;
        apikey: string;
        mediaId: string;
    }): Promise<MediaRow | null> {
        const [row] = await this.db
            .select()
            .from(media)
            .where(
                and(
                    eq(media.mediaId, mediaId),
                    eq(media.apikey, apikey),
                    eq(media.userId, userId),
                ),
            )
            .limit(1);
        return row ?? null;
    }

    async count(filter: MediaFilter): Promise<number> {
        const [row] = await this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(media)
            .where(and(...buildFilterConditions(filter)));
        return row?.count ?? 0;
    }

    async sumSize(filter: {
        userId: string;
        apikey?: string;
    }): Promise<number> {
        const conditions = [eq(media.userId, filter.userId), notTemp()];
        if (filter.apikey) {
            conditions.push(eq(media.apikey, filter.apikey));
        }
        const [row] = await this.db
            .select({
                totalSize: sql<number>`coalesce(sum(${media.size}), 0)::bigint`,
            })
            .from(media)
            .where(and(...conditions));
        return row ? Number(row.totalSize) : 0;
    }

    async paginate(
        filter: MediaFilter & { page?: number; recordsPerPage: number },
    ): Promise<MediaRow[]> {
        const { page, recordsPerPage } = filter;
        const offset = page ? (page - 1) * recordsPerPage : 0;
        return this.db
            .select()
            .from(media)
            .where(and(...buildFilterConditions(filter)))
            .orderBy(desc(media.createdAt), desc(media.id))
            .limit(recordsPerPage)
            .offset(offset);
    }

    async deleteOne(userId: string, mediaId: string): Promise<void> {
        await this.db
            .delete(media)
            .where(and(eq(media.userId, userId), eq(media.mediaId, mediaId)));
    }

    async deleteById(id: string): Promise<void> {
        await this.db.delete(media).where(eq(media.id, id));
    }

    async clearTemp({
        userId,
        apikey,
        mediaId,
    }: {
        userId: string;
        apikey: string;
        mediaId: string;
    }): Promise<void> {
        await this.db
            .update(media)
            .set({ temp: null })
            .where(
                and(
                    eq(media.mediaId, mediaId),
                    eq(media.userId, userId),
                    eq(media.apikey, apikey),
                ),
            );
    }

    async findExpiredTemp(cutoff: Date): Promise<MediaRow[]> {
        return this.db
            .select()
            .from(media)
            .where(and(eq(media.temp, true), lt(media.createdAt, cutoff)));
    }
}
