import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { handleTusUploadCreate, uploadGroup } from "../../src/tus/tus-server";
import mediaQueries from "../../src/media/queries";
import { createTusUpload } from "../../src/tus/queries";
import {
    maxFileUploadSizeNotSubscribed,
    maxStorageAllowedNotSubscribed,
} from "../../src/config/constants";
import {
    FILE_SIZE_EXCEEDED,
    NOT_ENOUGH_STORAGE,
} from "../../src/config/strings";

function req(user: any) {
    return {
        user,
        apikey: "test-api-key",
        group: "default",
    };
}

function upload(size: number) {
    return {
        id: "upload-id",
        size,
        metadata: {
            fileName: "test.txt",
            mimeType: "text/plain",
        },
    };
}

describe("TUS upload creation", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("rejects uploads that exceed the account file size limit", async () => {
        const user = {
            id: "test-user-id",
        };

        mock.fn(createTusUpload).mock.mockImplementation(() => {
            throw new Error("createTusUpload should not be called");
        });

        await assert.rejects(
            () =>
                handleTusUploadCreate(
                    req(user),
                    upload(maxFileUploadSizeNotSubscribed + 1),
                ),
            {
                status_code: 403,
                body: `${FILE_SIZE_EXCEEDED}. Allowed: ${maxFileUploadSizeNotSubscribed} bytes`,
            },
        );
    });

    test("rejects uploads that exceed remaining account storage", async () => {
        const user = {
            id: "test-user-id",
        };

        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => maxStorageAllowedNotSubscribed,
        );

        await assert.rejects(
            () => handleTusUploadCreate(req(user), upload(1024)),
            {
                status_code: 403,
                body: NOT_ENOUGH_STORAGE,
            },
        );
    });

    test("keeps the signature's group when the client sends another", () => {
        assert.strictEqual(
            uploadGroup("workspace-42", "client-forged-group"),
            "workspace-42",
        );
    });

    test("uses the client's group when the signature has none", () => {
        assert.strictEqual(uploadGroup(undefined, "avatars"), "avatars");
        assert.strictEqual(uploadGroup(null, "avatars"), "avatars");
        assert.strictEqual(uploadGroup(undefined, undefined), undefined);
    });
});
