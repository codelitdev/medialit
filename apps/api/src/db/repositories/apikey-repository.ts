import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { apikeys } from "../schema";
import type { ApikeyRow, NewApikeyRow } from "../types";

export type PublicApikeyRow = Pick<
    ApikeyRow,
    | "name"
    | "httpReferrers"
    | "ipAddresses"
    | "default"
    | "createdAt"
    | "updatedAt"
    | "keyId"
>;

export class ApikeyRepository {
    constructor(private readonly db: Database) {}

    async create(values: NewApikeyRow): Promise<ApikeyRow> {
        const [row] = await this.db.insert(apikeys).values(values).returning();
        return row;
    }

    async findByKey(key: string): Promise<ApikeyRow | null> {
        const [row] = await this.db
            .select()
            .from(apikeys)
            .where(eq(apikeys.key, key))
            .limit(1);
        return row ?? null;
    }

    async findByKeyId(keyId: string): Promise<ApikeyRow | null> {
        const [row] = await this.db
            .select()
            .from(apikeys)
            .where(eq(apikeys.keyId, keyId))
            .limit(1);
        return row ?? null;
    }

    async findByUserIdAndKey(
        userId: string,
        key: string,
    ): Promise<ApikeyRow | null> {
        const [row] = await this.db
            .select()
            .from(apikeys)
            .where(and(eq(apikeys.userId, userId), eq(apikeys.key, key)))
            .limit(1);
        return row ?? null;
    }

    async findByUserIdAndKeyId(
        userId: string,
        keyId: string,
        opts: { excludeDeleted?: boolean } = {},
    ): Promise<ApikeyRow | null> {
        const conditions = [
            eq(apikeys.userId, userId),
            eq(apikeys.keyId, keyId),
        ];
        if (opts.excludeDeleted) {
            conditions.push(eq(apikeys.deleted, false));
        }
        const [row] = await this.db
            .select()
            .from(apikeys)
            .where(and(...conditions))
            .limit(1);
        return row ?? null;
    }

    async findManyByUserId(
        userId: string,
        opts: { excludeDeleted?: boolean } = {},
    ): Promise<ApikeyRow[]> {
        const conditions = [eq(apikeys.userId, userId)];
        if (opts.excludeDeleted) {
            conditions.push(eq(apikeys.deleted, false));
        }
        return this.db
            .select()
            .from(apikeys)
            .where(and(...conditions));
    }

    async findPublicManyByUserId(userId: string): Promise<PublicApikeyRow[]> {
        return this.db
            .select({
                name: apikeys.name,
                httpReferrers: apikeys.httpReferrers,
                ipAddresses: apikeys.ipAddresses,
                default: apikeys.default,
                createdAt: apikeys.createdAt,
                updatedAt: apikeys.updatedAt,
                keyId: apikeys.keyId,
            })
            .from(apikeys)
            .where(and(eq(apikeys.userId, userId), eq(apikeys.deleted, false)));
    }

    async softDelete(userId: string, keyId: string): Promise<void> {
        await this.db
            .update(apikeys)
            .set({ deleted: true })
            .where(and(eq(apikeys.userId, userId), eq(apikeys.keyId, keyId)));
    }

    async renameByUserIdAndName(
        userId: string,
        name: string,
        newName: string,
    ): Promise<void> {
        await this.db
            .update(apikeys)
            .set({ name: newName })
            .where(and(eq(apikeys.userId, userId), eq(apikeys.name, name)));
    }

    async renameByUserIdAndKeyId(
        userId: string,
        keyId: string,
        newName: string,
    ): Promise<void> {
        await this.db
            .update(apikeys)
            .set({ name: newName })
            .where(and(eq(apikeys.userId, userId), eq(apikeys.keyId, keyId)));
    }
}
