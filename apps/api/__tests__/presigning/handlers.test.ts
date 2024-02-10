import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import preSignedUrlService from "../../lib/presigning/service";
import { getPresignedUrl } from "../../lib/presigning/handlers";
import queries from "../../lib/presigning/queries";
import mongoose from "mongoose";

describe("Presiging Url test suite", () => {
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

    // test("Get presigned url throws an error", async (t) => {
    //     const req = {
    //         user: {
    //             id: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5")
    //         },
    //         apikey: "test",
    //         protocol: "http",
    //         get: (data: any) => data,
    //         body: {
    //             group: "true"
    //         }
    //     }

    //     const res = {
    //         status: (code: number) => ({
    //             json: (data: any) => data
    //         })
    //     }

    //     let presignedUrl = "http://localhost:8000/media/create?signature=test"

    //     mock.method(preSignedUrlService,"generateSignedUrl").mock.mockImplementation(
    //         async () => ({ message: presignedUrl })
    //     )

    //     mock.method(queries, "createPresignedUrl").mock.mockImplementation(
    //         async () => (presignedUrl)
    //         // async () => ({
    //         //     id:new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
    //         //     userId: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
    //         //     apikey: "test",
    //         //     signature: "test",
    //         //     validTill: new Date(),
    //         // })
    //     )

    //     const response = await getPresignedUrl(req, res, () => {})
    //     console.log("getPresignedUrl response", response)
    //     assert.strictEqual(response, presignedUrl)
    //     // assert.strictEqual(response.message, "http://localhost:8000/media/create?signature=test")
    // });
});

// {"message":
// "http://localhost:8000/media/create?signature=2_QVA-zaJm1AA2YwWN7rwNT7v9DTeHZ9K4RcIWr-5x9TYtjjCkmKt1kyOOr53jKDfcO0njxQgcSQH4HIbLwrFWsIywQMB65qwFDj"
// }

// req.protocol req.get(Host) req.body.group --  http localhost:8000 undefined
