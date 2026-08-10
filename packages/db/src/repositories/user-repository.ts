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

    async create(values: NewUserRow): Promise<UserRow> {
        const [row] = await this.db.insert(users).values(values).returning();
        return row;
    }
}
