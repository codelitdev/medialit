import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import {
    createApikey,
    deleteApikey,
    getApikey,
} from "../../lib/apikey/handlers";
import queries from "../../lib/apikey/queries";
import { NOT_FOUND, SUCCESS } from "../../lib/config/strings";

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
        const response = await createApikey(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
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
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };
        mock.method(queries, "createApiKey").mock.mockImplementation(
            async () => ({ key: "123" })
        );

        const response = await createApikey(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.data.key, "123");
        assert.strictEqual(response.code, 200);
    });

    test("Create API throws an error", async (t) => {
        const req = {
            body: {
                name: "Test API",
            },
            user: {
                id: "123",
            },
        };
        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };
        mock.method(queries, "createApiKey").mock.mockImplementation(
            async () => {
                throw new Error("Error in creating");
            }
        );

        const response = await createApikey(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.data.error, "Error in creating");
        assert.strictEqual(response.code, 500);
    });

    test("Get API key returns 404 if key is not found", async (t) => {
        const req = {
            params: {
                keyId: "existentkey",
            },
            user: {
                id: "123",
            },
        };
        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };
        mock.method(queries, "getApiKeyByUserId").mock.mockImplementation(
            async () => null
        );

        const response = await getApikey(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.data.error, NOT_FOUND);
        assert.strictEqual(response.code, 404);
    });

    test("Get API key returns the key if found", async (t) => {
        const req = {
            params: {
                keyId: "M8purwS5KWwdYMHKD7XBz",
            },
            user: {
                id: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
            },
        };
        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        const apikey = {
            name: "key 9",
            key: "M8purwS5KWwdYMHKD7XBz",
            httpReferrers: [],
            ipAddresses: [],
            internal: false,
            createdAt: new Date("2024-01-25T10:21:48.141Z"),
            updatedAt: new Date("2024-02-01T11:37:00.130Z"),
        };
        mock.method(queries, "getApiKeyByUserId").mock.mockImplementation(
            async () => apikey
        );

        const response = await getApikey(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.deepStrictEqual(response, apikey);
    });

    test("Get API throws an error", async (t) => {
        const req = {
            params: {
                keyId: "M8purwS5KWwdYMHKD7XBz",
            },
            user: {
                id: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
            },
        };
        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };
        mock.method(queries, "getApiKeyByUserId").mock.mockImplementation(
            async () => {
                throw new Error("Error in get api key");
            }
        );

        const response = await getApikey(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.data.error, "Error in get api key");
        assert.strictEqual(response.code, 500);
    });

    test("Delete API succeeds", async (t) => {
        const req = {
            params: {
                keyId: "abc123",
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

        mock.method(queries, "deleteApiKey").mock.mockImplementation(
            async () => ({ message: SUCCESS })
        );
        const response = await deleteApikey(req, res, () => {
            return 1;
        });
        assert.strictEqual(response.message, SUCCESS);
    });

    test("Delete API throws an error", async (t) => {
        const req = {
            params: {
                keyId: "abc123",
            },
            user: {
                id: "123",
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        mock.method(queries, "deleteApiKey").mock.mockImplementation(
            async () => {
                throw new Error("Error in deleting");
            }
        );
        const response: any = await deleteApikey(req, res, () => {
            return 1;
        });
        assert.strictEqual(response.data.error, "Error in deleting");
        assert.strictEqual(response.code, 500);
    });
});
