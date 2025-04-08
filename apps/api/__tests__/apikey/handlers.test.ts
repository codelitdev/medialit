import test, { afterEach, describe, mock } from "node:test";
import { createApikey } from "../../src/apikey/handlers";
import assert from "node:assert";
import queries from "../../src/apikey/queries";

describe("API key test suite", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("Create API key throws an error if name is empty", async (t) => {
        const req = {
            body: {},
        };
        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };
        const response = await createApikey(req, res, () => {});
        assert.strictEqual(response.error, "Name is required");
    });

    test("Create API succeeds if name is provided.", async (t) => {
        const req = {
            body: {
                name: "Test API",
            },
            user: {
                id: "123",
            },
        };
        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };
        mock.method(queries, "createApiKey").mock.mockImplementation(
            async () => ({ key: "123" }),
        );
        const response = await createApikey(req, res, () => {});
        assert.strictEqual(response.key, "123");
    });
});
