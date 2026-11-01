import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { callTool } from "./call-tool";
import mediaQueries from "../../src/media/queries";
import mediaService from "../../src/media/service";
import {
    maxFileUploadSizeNotSubscribed,
    maxStorageAllowedNotSubscribed,
} from "../../src/config/constants";
import {
    FILE_SIZE_EXCEEDED,
    NOT_ENOUGH_STORAGE,
} from "../../src/config/strings";

function uploadArgs(size: number) {
    return {
        fileBase64: Buffer.alloc(size).toString("base64"),
        fileName: "test.txt",
        mimeType: "text/plain",
    };
}

describe("MCP upload_media", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("rejects uploads that exceed the account file size limit", async () => {
        const user = {
            id: "test-user-id",
        };

        mock.method(mediaService, "upload").mock.mockImplementation(() => {
            throw new Error("upload should not be called");
        });

        const response = await callTool(
            "upload_media",
            { user, userId: user.id },
            uploadArgs(maxFileUploadSizeNotSubscribed + 1),
        );

        assert.equal(response.error.code, "validation_failed");
        assert.deepEqual(response.error.safeDetails, {
            reason: "file_size_exceeded",
            message: `${FILE_SIZE_EXCEEDED}. Allowed: ${maxFileUploadSizeNotSubscribed} bytes`,
        });
    });

    test("rejects uploads that exceed remaining account storage", async () => {
        const user = {
            id: "test-user-id",
        };

        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => maxStorageAllowedNotSubscribed,
        );
        mock.method(mediaService, "upload").mock.mockImplementation(() => {
            throw new Error("upload should not be called");
        });

        const response = await callTool(
            "upload_media",
            { user, userId: user.id },
            uploadArgs(1024),
        );

        assert.equal(response.error.code, "forbidden");
        assert.deepEqual(response.error.safeDetails, {
            reason: "not_enough_storage",
            message: NOT_ENOUGH_STORAGE,
        });
    });
});
