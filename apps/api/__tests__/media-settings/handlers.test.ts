import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { getMediaSettingsHandler } from "../../lib/media-settings/handlers";
import mongoose from "mongoose";
import queries from "../../lib/media-settings/queries";

describe("Media settings test suite", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("Get media settings", async (t) => {
        const req = {
            user: {
                id: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
            },
            apikey: "test",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        mock.method(queries, "getMediaSettings").mock.mockImplementation(
            async () => ({
                useWebP: true,
                webpOutputQuality: 85,
                thumbnailHeight: 1,
                thumbnailWidth: 1,
            })
        );

        const response = await getMediaSettingsHandler(req, res);
        assert.deepStrictEqual(response, {
            useWebP: true,
            webpOutputQuality: 85,
            thumbnailHeight: 1,
            thumbnailWidth: 1,
        });
    });

    test("Get media settings return empty {} if mediasettings not found", async (t) => {
        const req = {
            user: {
                id: new mongoose.Types.ObjectId("652e67318ff18780e2eb5bf5"),
            },
            apikey: "test",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        mock.method(queries, "getMediaSettings").mock.mockImplementation(
            async () => null
        );

        const response = await getMediaSettingsHandler(req, res);
        assert.deepStrictEqual(response, {});
    });
});
