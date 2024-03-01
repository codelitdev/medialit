import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import thumbnail from "@medialit/thumbnail";
import { generateAndUploadThumbnail } from "../../src/media/service";
import s3 from "../../src/services/s3";

describe("Media service test suite", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("Image pattern including gif", async (t) => {
        const workingDirectory = "abcd";
        const key = "test";
        const mimetype = "image/png";
        const originalFilePath = "/ravi.png";
        const tags = "123ravi";

        const call = mock.method(thumbnail, "forImage");
        mock.method(s3, "putObject").mock.mockImplementation(async () => 1);

        const response = await generateAndUploadThumbnail({
            workingDirectory,
            key,
            mimetype,
            originalFilePath,
            tags,
        });

        assert.strictEqual(call.mock.calls.length, 1);
        assert.strictEqual(
            response,
            true,
            "Thumbnail generation should be successful"
        );
    });
});
