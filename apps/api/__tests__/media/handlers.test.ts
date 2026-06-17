import { Constants } from "@medialit/models";
import test, { afterEach, describe, mock } from "node:test";
import { uploadMedia } from "../../src/media/handlers";
import assert from "node:assert";
import mediaService from "../../src/media/service";

describe("Media handlers", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("should allow larger file upload for subscribed user", async () => {
        const req = {
            files: {
                file: {
                    size: 100000000, // 100MB - within subscribed limit
                },
            },
            user: {
                id: "123",
                subscriptionStatus: Constants.SubscriptionStatus.SUBSCRIBED,
            },
            socket: {
                setTimeout: () => {},
            },
            body: {},
            query: {},
            headers: {},
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ code, data }),
            }),
        };

        mock.method(mediaService, "upload").mock.mockImplementation(
            async () => "test-media-id",
        );

        mock.method(mediaService, "getMediaDetails").mock.mockImplementation(
            async () => ({
                mediaId: "test-media-id",
                originalFileName: "test.jpg",
                mimeType: "image/jpeg",
                size: 1024,
                access: "private",
                file: "http://example.com/file.jpg",
                thumbnail: "http://example.com/thumb.jpg",
                caption: "test caption",
                group: "default",
            }),
        );

        const response = await uploadMedia(req, res, () => {});
        console.log("Response", response);
        assert.strictEqual(response.code, 200);
    });
});
