import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import apikey from "../../src/apikey/middleware";
import queries from "../../src/apikey/queries";
import { BAD_REQUEST, UNAUTHORISED } from "../../src/config/strings";

describe("API key test suite for middleware", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("Api key does not exist", async (t) => {
        const req = {
            body: {},
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        const response = await apikey(req, res, () => {
            return 1;
        });

        assert.strictEqual(response.data.error, BAD_REQUEST);
        assert.strictEqual(response.code, 400);
    });

    test("Unauthorised if Api key not found", async (t) => {
        const req = {
            body: {
                apikey: "test",
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        mock.method(queries, "getApiKeyUsingKeyId").mock.mockImplementation(
            async () => null
        );

        const response = await apikey(req, res, () => {
            return 1;
        });

        assert.strictEqual(response.data.error, UNAUTHORISED);
        assert.strictEqual(response.code, 401);
    });

    // test("InternalKey not exist", async (t) => {
    //     const req = {
    //         body: {
    //             apikey: "test",
    //             internalKey: "test",
    //         }
    //     };

    //     const res = {
    //         status: (code: number) => ({
    //             json: (data: any) => ({data, code}),
    //         })
    //     };

    //     mock.method(queries, "getApiKeyUsingKeyId").mock.mockImplementation(
    //         async () => ({key: "test key"})
    //     )

    //     mock.method(queries, "getApiKeyUsingKeyId").mock.mockImplementation(
    //         async () => (null)
    //     )

    //     const response = await apikey(req, res, () => {return 1})
    //     console.log("response internal", response);

    //     assert.strictEqual(response.data.error, UNAUTHORISED)
    //     assert.strictEqual(response.code, 401);
    // })
});
