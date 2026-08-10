import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { users } from "../schema";
import type { NewUserRow, UserRow } from "../types";

export class UserRepository {
    constructor(private readonly db: Database) {}

    async findById(id: string): Promise<UserRow | null> {
        const [row] = await this.db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
        return row ?? null;
    }

    async findByEmail(email: string): Promise<UserRow | null> {
        const [row] = await this.db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
        return row ?? null;
    }

    async findByUserId(userId: string): Promise<UserRow | null> {
        const [row] = await this.db
            .select()
            .from(users)
            .where(eq(users.userId, userId))
            .limit(1);
        return row ?? null;
    }

    async updateSubscription(
        id: string,
        values: Partial<
            Pick<
                NewUserRow,
                | "customerId"
                | "subscriptionId"
                | "subscriptionEndsAfter"
                | "subscriptionMethod"
                | "subscriptionStatus"
            >
        >,
    ): Promise<UserRow | null> {
        const [row] = await this.db
            .update(users)
            .set(values)
            .where(eq(users.id, id))
            .returning();
        return row ?? null;
    }

    async create(values: NewUserRow): Promise<UserRow> {
        const [row] = await this.db.insert(users).values(values).returning();
        return row;
    }
}
