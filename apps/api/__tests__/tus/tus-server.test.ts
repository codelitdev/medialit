import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { handleTusUploadCreate, uploadGroup } from "../../src/tus/tus-server";
import mediaQueries from "../../src/media/queries";
import { createTusUpload } from "../../src/tus/queries";
import { newUploadTarget } from "../../src/media/ingest";
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
        appId: "test-app",
        group: "default",
    };
}

function upload(size: number) {
    return {
        id: newUploadTarget("test.txt").key,
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

describe("TUS upload IDs", () => {
    test("round-trips an upload key through the URL", async () => {
        const { encodeUploadId, decodeUploadId } = await import(
            "../../src/tus/tus-server"
        );
        const { newUploadTarget } = await import("../../src/media/ingest");
        const { key } = newUploadTarget("movie.mp4");
        const segment = encodeUploadId(key);
        assert.match(segment, /^[A-Za-z0-9_-]+$/);
        assert.strictEqual(decodeUploadId(segment), key);
    });

    test("refuses IDs that aren't upload keys", async () => {
        const { encodeUploadId, decodeUploadId } = await import(
            "../../src/tus/tus-server"
        );
        for (const id of [
            "some-other-object",
            "p/abc/main.jpg",
            "i/abc/thumb.webp",
            "i/../secret/main.jpg",
            "i/abc/main.jpg.info",
        ]) {
            assert.strictEqual(decodeUploadId(encodeUploadId(id)), undefined);
        }
        // Old file-store IDs from before the S3 store.
        assert.strictEqual(
            decodeUploadId("5d1f0e7c2a9b4c3d8e6f7a1b2c3d4e5f"),
            undefined,
        );
        assert.strictEqual(decodeUploadId("not base64!"), undefined);
    });
});

describe("TUS upload creation without a declared size", () => {
    test("rejects Upload-Defer-Length", async () => {
        const { newUploadTarget } = await import("../../src/media/ingest");
        await assert.rejects(
            () =>
                handleTusUploadCreate(req({ id: "u" }), {
                    id: newUploadTarget("a.txt").key,
                    size: undefined,
                    sizeIsDeferred: true,
                    metadata: { fileName: "a.txt" },
                }),
            { status_code: 400, body: "Upload-Length is required" },
        );
    });
});
