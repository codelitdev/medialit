import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { getTableColumns, eq } from "drizzle-orm";
import { authJwks } from "../db/schema";

const databaseUrl = process.env.MEDIALIT_AUTH_TEST_DB_CONNECTION_STRING;

test("the Drizzle JWKS schema matches Better Auth's JWT plugin contract", () => {
    const fields = getTableColumns(authJwks);

    // Better Auth's jwt() plugin queries these two optional fields even while
    // resolving an ordinary browser session. Keeping this assertion close to
    // the adapter integration test prevents a login redirect loop from being
    // reintroduced by a schema edit.
    assert.ok(fields.alg);
    assert.ok(fields.crv);
});

test(
    "Better Auth resolves a signed session through the Drizzle adapter",
    { skip: !databaseUrl },
    async () => {
        // Integration tests must use an isolated database. A running
        // deployment can contain JWKS private keys encrypted with its own
        // secret, which must never be touched by the test suite.
        process.env.DB_CONNECTION_STRING = databaseUrl;
        process.env.BETTER_AUTH_SECRET ||=
            "test-only-secret-with-at-least-thirty-two-characters";

        // Load these after setting DB_CONNECTION_STRING: config/constants.ts
        // captures environment values at module initialization time.
        const dbModule: typeof import("../config/db") = require("../config/db");
        const schema: typeof import("../db/schema") = require("../db/schema");
        const databaseClient: typeof import("../db/client") = require("../db/client");
        const authModule: typeof import("./better-auth") = require("./better-auth");
        const { default: connectToDatabase, getDb } = dbModule;
        await connectToDatabase();
        authModule.initializeAuth();

        const id = randomUUID();
        const token = randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 60_000);
        const db = getDb();

        await db.insert(schema.authUsers).values({
            id,
            name: "Authentication test",
            email: `auth-test-${id}@example.com`,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
        });
        await db.insert(schema.authSessions).values({
            id: randomUUID(),
            token,
            userId: id,
            expiresAt,
            createdAt: now,
            updatedAt: now,
        });

        try {
            const signature = createHmac(
                "sha256",
                process.env.BETTER_AUTH_SECRET,
            )
                .update(token)
                .digest("base64");
            const result = await authModule.getAuth().api.getSession({
                headers: new Headers({
                    cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
                }),
            });

            assert.equal(result?.user.id, id);
            assert.equal(result?.session.userId, id);
        } finally {
            await db
                .delete(schema.authSessions)
                .where(eq(schema.authSessions.token, token));
            await db
                .delete(schema.authUsers)
                .where(eq(schema.authUsers.id, id));
            await databaseClient.closeDatabase();
        }
    },
);
