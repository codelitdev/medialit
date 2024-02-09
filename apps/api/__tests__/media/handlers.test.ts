import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import mediaService from "../../lib/media/service";
import {
    deleteMedia,
    getMedia,
    getMediaDetails,
    uploadMedia,
} from "../../lib/media/handlers";
import {
    FILE_IS_REQUIRED,
    NOT_FOUND,
    SUCCESS,
    FILE_SIZE_EXCEEDED,
} from "../../lib/config/strings";

describe("Media test suite", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("Delete media", async (t) => {
        const req = {
            params: {
                mediaId: "abc123",
            },
            user: {
                id: "asd123",
            },
            apikey: "123qwe",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };
        const mediaId = "abc123";

        mock.method(mediaService, "deleteMedia").mock.mockImplementation(
            async () => ({
                userId: "asd123",
                apikey: "123qwe",
                mediaId,
            })
        );

        const response = await deleteMedia(req, res);
        assert.strictEqual(response.message, SUCCESS);
    });

    test("Delete media throws an error", async (t) => {
        const req = {
            params: {
                mediaId: "abc123",
            },
            user: {
                id: "asd123",
            },
            apikey: "123qwe",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        mock.method(mediaService, "deleteMedia").mock.mockImplementation(
            async () => {
                throw new Error("Error in deleting");
            }
        );

        const response = await deleteMedia(req, res);
        assert.strictEqual(response, "Error in deleting");
    });

    test("Get media details throws an error if media is not found", async (t) => {
        const req = {
            params: {
                mediaId: "abc123",
            },
            user: {
                id: "asd123",
            },
            apikey: "123qwe",
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        mock.method(mediaService, "getMediaDetails").mock.mockImplementation(
            async () => null
        );

        const response = await getMediaDetails(req, res);
        assert.strictEqual(response.data.error, NOT_FOUND);
        assert.strictEqual(response.code, 404);
    });

    test("Get media details if media is found", async (t) => {
        const req = {
            params: {
                mediaId: "abc123",
            },
            user: {
                id: "asd123",
            },
            apikey: "123qwe",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };
        let media;

        mock.method(mediaService, "getMediaDetails").mock.mockImplementation(
            async () =>
                (media = {
                    mediaId: "m5tF9wQfxTMX9E6TB4Nwv1htbjTtzHxlXaku0uf1",
                    originalFileName: "2023 (4).png",
                    mimeType: "image/png",
                    size: 280282,
                    access: "private",
                    file: "https://courselit-qa.s3.amazonaws.com/medialit-service/m5tF9wQfxTMX9E6TB4Nwv1htbjTtzHxlXaku0uf1/main.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAXHREOCLPZBRNMUX2%2F20240206%2Fap-southeast-1%2Fs3%2Faws4_request&X-Amz-Date=20240206T124029Z&X-Amz-Expires=900&X-Amz-Signature=b074b4ae494d94ac2f090fc2a19756d315dd8b7aa951071ffd9d064f5dfe95ff&X-Amz-SignedHeaders=host&x-id=GetObject",
                    thumbnail:
                        "https://courselit-qa.s3.ap-southeast-1.amazonaws.com/medialit-service/m5tF9wQfxTMX9E6TB4Nwv1htbjTtzHxlXaku0uf1/thumb.webp",
                    caption: "Rajat",
                    group: "true",
                })
        );

        const response = await getMediaDetails(req, res);
        assert.strictEqual(response, media);
    });

    test("Get media details throws an error", async (t) => {
        const req = {
            params: {
                mediaId: "abc123",
            },
            user: {
                id: "asd123",
            },
            apikey: "123qwe",
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        mock.method(mediaService, "getMediaDetails").mock.mockImplementation(
            async () => {
                throw new Error("Error in get media details");
            }
        );
        const response: any = await getMediaDetails(req, res);
        assert.strictEqual(response.data, "Error in get media details");
        assert.strictEqual(response.code, 500);
    });

    test("Get media page", async (t) => {
        const req = {
            query: {
                page: "1",
                limit: "2",
                access: "public" || "private",
                group: "true",
            },
            user: {
                _id: "abc123",
            },
            apikey: "5wcDenboHv1osn",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        const media = {
            mediaId: "-5wcDenboHv1osn",
            originalFileName: "Screenshot 2023-09-19 183027.png",
            mimeType: "image/png",
            size: 223325,
            access: "public",
            thumbnail:
                "https://courselit-qa.s3.ap-southeast-1.amazonaws.com/medialit-service/-5wcDenboHv1osnAtmpOWwJzKycEVO7uTPtEXf9O/thumb.webp",
            caption: "media key1",
            group: "true",
        };

        mock.method(mediaService, "getPage").mock.mockImplementation(
            async () => ({
                media,
            })
        );

        const response = await getMedia(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.media, media);
    });

    test("Get media page throws an error", async (t) => {
        const req = {
            query: {
                page: "1",
                limit: "2",
                access: "public" || "private",
                group: "true",
            },
            user: {
                _id: "abc123",
            },
            apikey: "5wcDenboHv1osn",
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        mock.method(mediaService, "getPage").mock.mockImplementation(
            async () => {
                throw new Error("Error in get page");
            }
        );

        const response = await getMedia(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.data, "Error in get page");
        assert.strictEqual(response.code, 500);
    });

    test("Upload media throw error if files is not found", async (t) => {
        const req = {
            socket: {
                setTimeout: (data: any) => data,
            },
            files: {},
            body: {
                access: "public" || "private",
                group: "true",
                caption: "ravi",
            },
            user: {
                id: "123abc",
            },
            apikey: "asdf",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        const response = await uploadMedia(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.error, FILE_IS_REQUIRED);
    });

    test("Upload media throw error if upload size is maximum", async (t) => {
        const req = {
            socket: {
                setTimeout: (data: any) => data,
            },
            files: {
                file: {
                    name: "Ravi",
                    size: "21474836499",
                },
            },
            body: {
                access: "public" || "private",
                group: "true",
                caption: "ravi",
            },
            user: {
                id: "123abc",
            },
            apikey: "asdf",
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };

        const response = await uploadMedia(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.error, FILE_SIZE_EXCEEDED);
    });

    test("Upload media succeeds", async (t) => {
        const req = {
            socket: {
                setTimeout: (data: any) => data,
            },
            files: {
                file: {
                    name: "Ravi",
                    size: "214748364",
                },
            },
            body: {
                access: "public" || "private",
                group: "true",
                caption: "ravi",
            },
            user: {
                id: "123abc",
            },
            apikey: "asdf",
            query: {
                signature: "shjkhfhfuibjsdbfksdbfbsbfo",
            },
        };

        const res = {
            status: () => ({
                json: (data: any) => data,
            }),
        };
        const mediaId = "fsfsfdff";
        mock.method(mediaService, "upload").mock.mockImplementation(
            async () => mediaId
        );

        const media = {
            mediaId: "fsfsfdff",
            originalFileName: "2023 (4).png",
            mimeType: "image/png",
            size: 280282,
            access: "private",
            file: "https://courselit-qa.s3.amazonaws.com/medialit-service/m5tF9wQfxTMX9E6TB4Nwv1htbjTtzHxlXaku0uf1/main.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAXHREOCLPZBRNMUX2%2F20240206%2Fap-southeast-1%2Fs3%2Faws4_request&X-Amz-Date=20240206T124029Z&X-Amz-Expires=900&X-Amz-Signature=b074b4ae494d94ac2f090fc2a19756d315dd8b7aa951071ffd9d064f5dfe95ff&X-Amz-SignedHeaders=host&x-id=GetObject",
            thumbnail:
                "https://courselit-qa.s3.ap-southeast-1.amazonaws.com/medialit-service/m5tF9wQfxTMX9E6TB4Nwv1htbjTtzHxlXaku0uf1/thumb.webp",
            caption: "Rajat",
            group: "true",
        };
        mock.method(mediaService, "getMediaDetails").mock.mockImplementation(
            async () => media
        );

        const response = await uploadMedia(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response, media, "media");
    });

    test("Upload media throws an error", async (t) => {
        const req = {
            socket: {
                setTimeout: (data: any) => data,
            },
            files: {
                file: {
                    name: "Ravi",
                    size: "214748364",
                },
            },
            body: {
                access: "public" || "private",
                group: "true",
                caption: "ravi",
            },
            user: {
                id: "123abc",
            },
            apikey: "asdf",
            query: {
                signature: "shjkhfhfuibjsdbfksdbfbsbfo",
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ data, code }),
            }),
        };

        const mediaId = "fsfsfdff";
        mock.method(mediaService, "upload").mock.mockImplementation(
            async () => mediaId
        );

        mock.method(mediaService, "getMediaDetails").mock.mockImplementation(
            async () => {
                throw new Error("Error in upload media");
            }
        );

        const response = await uploadMedia(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        assert.strictEqual(response.data.error, "Error in upload media");
        assert.strictEqual(response.code, 500);
    });
});
