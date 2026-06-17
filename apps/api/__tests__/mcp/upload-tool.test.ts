import { Constants } from "@medialit/models";
import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { handleUploadMediaTool } from "../../src/mcp/tools/upload";
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

function authInfo(user: any) {
    return {
        authInfo: {
            clientId: user.id,
            token: "test-api-key",
            user,
        },
    };
}

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
            subscriptionStatus: Constants.SubscriptionStatus.NOT_SUBSCRIBED,
        };

        mock.method(mediaService, "upload").mock.mockImplementation(() => {
            throw new Error("upload should not be called");
        });

        const response = await handleUploadMediaTool(
            uploadArgs(maxFileUploadSizeNotSubscribed + 1),
            authInfo(user),
        );

        assert.equal((response as any).isError, true);
        assert.equal(
            response.content[0].text,
            `${FILE_SIZE_EXCEEDED}. Allowed: ${maxFileUploadSizeNotSubscribed} bytes`,
        );
    });

    test("rejects uploads that exceed remaining account storage", async () => {
        const user = {
            id: "test-user-id",
            subscriptionStatus: Constants.SubscriptionStatus.NOT_SUBSCRIBED,
        };

        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => maxStorageAllowedNotSubscribed,
        );
        mock.method(mediaService, "upload").mock.mockImplementation(() => {
            throw new Error("upload should not be called");
        });

        const response = await handleUploadMediaTool(
            uploadArgs(1024),
            authInfo(user),
        );

        assert.equal((response as any).isError, true);
        assert.equal(response.content[0].text, NOT_ENOUGH_STORAGE);
    });
});
