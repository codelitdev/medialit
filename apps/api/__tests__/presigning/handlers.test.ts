import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { getPresignedUrl } from "../../src/presigning/handlers";
import queries from "../../src/presigning/queries";
import mongoose from "mongoose";

describe("Presigning Url test suite", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("Get presigned url", async (t) => {
        const req = {
            user: {
                id: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
            },
            apikey: "test",
            protocol: "http",
            get: (data: any) => "localhost:8000",
            body: {
                group: "true",
            },
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        const presignedUrl =
            "http://localhost:8000/media/create?signature=test";

        mock.method(queries, "createPresignedUrl").mock.mockImplementation(
            async () => ({ signature: "test" })
        );

        mock.method(queries, "cleanupExpiredLinks").mock.mockImplementation(
            async () => {
                return 1;
            }
        );

        const response = await getPresignedUrl(req, res, () => {
            return 1;
        });
        assert.strictEqual(response.message, presignedUrl);
    });

    test("Get presigned url throws an error", async (t) => {
        const req = {
            user: {
                id: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
            },
            apikey: "test",
            protocol: "http",
            get: (data: any) => "localhost:8000",
            body: {
                group: "true",
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        mock.method(queries, "createPresignedUrl").mock.mockImplementation(
            async () => {
                throw new Error("Erron in getting presigned url");
            }
        );

        mock.method(queries, "cleanupExpiredLinks").mock.mockImplementation(
            async () => {
                return 1;
            }
        );

        const response = await getPresignedUrl(req, res, () => {
            return 1;
        });
        assert.strictEqual(response.data, "Erron in getting presigned url");
        assert.strictEqual(response.code, 500);
    });
});
