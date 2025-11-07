import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Constants, Media } from "@medialit/models";
import { PATH_KEY } from "@/media/utils/generate-key";

// Helper to clear module cache and re-import
const clearModuleCache = () => {
    const modulePath = require.resolve("@/media/utils/get-public-urls");
    const constantsPath = require.resolve("@/config/constants");
    delete require.cache[modulePath];
    delete require.cache[constantsPath];
};

// Helper to create mock media
const createMockMedia = (overrides: Partial<Media> = {}): Media => ({
    fileName: "main.jpg",
    mediaId: "test-media-id-123",
    apikey: "test-apikey",
    originalFileName: "original.jpg",
    mimeType: "image/jpeg",
    size: 1024,
    thumbnailGenerated: true,
    accessControl: Constants.AccessControl.PUBLIC,
    ...overrides,
});

describe("get-public-urls", () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        // Save original env vars
        originalEnv.CDN_ENDPOINT = process.env.CDN_ENDPOINT;
        originalEnv.CLOUD_ENDPOINT = process.env.CLOUD_ENDPOINT;
        originalEnv.CLOUD_ENDPOINT_PUBLIC = process.env.CLOUD_ENDPOINT_PUBLIC;
        originalEnv.PATH_PREFIX = process.env.PATH_PREFIX;
    });

    afterEach(() => {
        // Restore original env vars
        if (originalEnv.CDN_ENDPOINT !== undefined) {
            process.env.CDN_ENDPOINT = originalEnv.CDN_ENDPOINT;
        } else {
            delete process.env.CDN_ENDPOINT;
        }
        if (originalEnv.CLOUD_ENDPOINT !== undefined) {
            process.env.CLOUD_ENDPOINT = originalEnv.CLOUD_ENDPOINT;
        } else {
            delete process.env.CLOUD_ENDPOINT;
        }
        if (originalEnv.CLOUD_ENDPOINT_PUBLIC !== undefined) {
            process.env.CLOUD_ENDPOINT_PUBLIC =
                originalEnv.CLOUD_ENDPOINT_PUBLIC;
        } else {
            delete process.env.CLOUD_ENDPOINT_PUBLIC;
        }
        if (originalEnv.PATH_PREFIX !== undefined) {
            process.env.PATH_PREFIX = originalEnv.PATH_PREFIX;
        } else {
            delete process.env.PATH_PREFIX;
        }
        clearModuleCache();
    });

    describe("getMainFileUrl", () => {
        test("should use CDN_ENDPOINT when provided (takes precedence)", () => {
            process.env.CDN_ENDPOINT = "https://cdn.example.com";
            process.env.CLOUD_ENDPOINT = "https://private.s3.amazonaws.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.s3.amazonaws.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const { getMainFileUrl } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PUBLIC,
                fileName: "main.jpg",
            });

            const url = getMainFileUrl(media);
            assert.strictEqual(
                url,
                `https://cdn.example.com/${PATH_KEY.PUBLIC}/test-media-id-123/main.jpg`,
            );
        });

        test("should use CLOUD_ENDPOINT_PUBLIC when CDN_ENDPOINT not provided and media is public", () => {
            delete process.env.CDN_ENDPOINT;
            process.env.CLOUD_ENDPOINT = "https://private.s3.amazonaws.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.s3.amazonaws.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const { getMainFileUrl } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PUBLIC,
                fileName: "main.png",
            });

            const url = getMainFileUrl(media);
            assert.strictEqual(
                url,
                `https://public.s3.amazonaws.com/${PATH_KEY.PUBLIC}/test-media-id-123/main.png`,
            );
        });

        test("should fallback to CLOUD_ENDPOINT when CLOUD_ENDPOINT_PUBLIC not provided and media is public", () => {
            delete process.env.CDN_ENDPOINT;
            process.env.CLOUD_ENDPOINT = "https://private.s3.amazonaws.com";
            delete process.env.CLOUD_ENDPOINT_PUBLIC;
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const { getMainFileUrl } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PUBLIC,
                fileName: "main.webp",
            });

            const url = getMainFileUrl(media);
            assert.strictEqual(
                url,
                `https://private.s3.amazonaws.com/${PATH_KEY.PUBLIC}/test-media-id-123/main.webp`,
            );
        });

        test("should use CLOUD_ENDPOINT when media is private (defensive check)", () => {
            delete process.env.CDN_ENDPOINT;
            process.env.CLOUD_ENDPOINT = "https://private.s3.amazonaws.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.s3.amazonaws.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const { getMainFileUrl } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PRIVATE,
                fileName: "main.jpg",
            });

            const url = getMainFileUrl(media);
            assert.strictEqual(
                url,
                `https://private.s3.amazonaws.com/${PATH_KEY.PUBLIC}/test-media-id-123/main.jpg`,
            );
        });

        test("should include PATH_PREFIX when provided", () => {
            process.env.CDN_ENDPOINT = "https://cdn.example.com";
            process.env.PATH_PREFIX = "tenant-123";
            clearModuleCache();

            const { getMainFileUrl } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PUBLIC,
                fileName: "main.jpg",
            });

            const url = getMainFileUrl(media);
            assert.strictEqual(
                url,
                `https://cdn.example.com/tenant-123/${PATH_KEY.PUBLIC}/test-media-id-123/main.jpg`,
            );
        });
    });

    describe("getThumbnailUrl", () => {
        test("should use CDN_ENDPOINT when provided (takes precedence)", () => {
            process.env.CDN_ENDPOINT = "https://cdn.example.com";
            process.env.CLOUD_ENDPOINT = "https://private.s3.amazonaws.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.s3.amazonaws.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const {
                getThumbnailUrl,
            } = require("@/media/utils/get-public-urls");
            const media = createMockMedia();

            const url = getThumbnailUrl(media);
            assert.strictEqual(
                url,
                `https://cdn.example.com/${PATH_KEY.PUBLIC}/test-media-id-123/thumb.webp`,
            );
        });

        test("should use CLOUD_ENDPOINT_PUBLIC when CDN_ENDPOINT not provided", () => {
            delete process.env.CDN_ENDPOINT;
            process.env.CLOUD_ENDPOINT = "https://private.s3.amazonaws.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.s3.amazonaws.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const {
                getThumbnailUrl,
            } = require("@/media/utils/get-public-urls");
            const media = createMockMedia();

            const url = getThumbnailUrl(media);
            assert.strictEqual(
                url,
                `https://public.s3.amazonaws.com/${PATH_KEY.PUBLIC}/test-media-id-123/thumb.webp`,
            );
        });

        test("should use CLOUD_ENDPOINT_PUBLIC when CDN_ENDPOINT not provided (validation ensures it exists)", () => {
            delete process.env.CDN_ENDPOINT;
            process.env.CLOUD_ENDPOINT = "https://private.s3.amazonaws.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.s3.amazonaws.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const {
                getThumbnailUrl,
            } = require("@/media/utils/get-public-urls");
            const media = createMockMedia();

            const url = getThumbnailUrl(media);
            assert.strictEqual(
                url,
                `https://public.s3.amazonaws.com/${PATH_KEY.PUBLIC}/test-media-id-123/thumb.webp`,
            );
        });

        test("should include PATH_PREFIX when provided", () => {
            process.env.CDN_ENDPOINT = "https://cdn.example.com";
            process.env.PATH_PREFIX = "tenant-456";
            clearModuleCache();

            const {
                getThumbnailUrl,
            } = require("@/media/utils/get-public-urls");
            const media = createMockMedia();

            const url = getThumbnailUrl(media);
            assert.strictEqual(
                url,
                `https://cdn.example.com/tenant-456/${PATH_KEY.PUBLIC}/test-media-id-123/thumb.webp`,
            );
        });
    });

    describe("Progressive behavior", () => {
        test("Scenario 1: Base setup - CLOUD_ENDPOINT + CLOUD_ENDPOINT_PUBLIC (no CDN)", () => {
            delete process.env.CDN_ENDPOINT;
            process.env.CLOUD_ENDPOINT =
                "https://private.r2.cloudflarestorage.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.r2.cloudflarestorage.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const {
                getMainFileUrl,
                getThumbnailUrl,
            } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PUBLIC,
            });

            const mainUrl = getMainFileUrl(media);
            const thumbUrl = getThumbnailUrl(media);

            assert.strictEqual(
                mainUrl,
                `https://public.r2.cloudflarestorage.com/${PATH_KEY.PUBLIC}/test-media-id-123/main.jpg`,
            );
            assert.strictEqual(
                thumbUrl,
                `https://public.r2.cloudflarestorage.com/${PATH_KEY.PUBLIC}/test-media-id-123/thumb.webp`,
            );
        });

        test("Scenario 2: With CDN_ENDPOINT (progressive enhancement)", () => {
            process.env.CDN_ENDPOINT = "https://cdn.medialit.cloud";
            process.env.CLOUD_ENDPOINT =
                "https://private.r2.cloudflarestorage.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.r2.cloudflarestorage.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const {
                getMainFileUrl,
                getThumbnailUrl,
            } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PUBLIC,
            });

            const mainUrl = getMainFileUrl(media);
            const thumbUrl = getThumbnailUrl(media);

            // CDN should take precedence
            assert.strictEqual(
                mainUrl,
                `https://cdn.medialit.cloud/${PATH_KEY.PUBLIC}/test-media-id-123/main.jpg`,
            );
            assert.strictEqual(
                thumbUrl,
                `https://cdn.medialit.cloud/${PATH_KEY.PUBLIC}/test-media-id-123/thumb.webp`,
            );
        });

        test("Scenario 3: CLOUD_ENDPOINT + CLOUD_ENDPOINT_PUBLIC (no CDN, validation ensures both exist)", () => {
            delete process.env.CDN_ENDPOINT;
            process.env.CLOUD_ENDPOINT = "https://s3.amazonaws.com";
            process.env.CLOUD_ENDPOINT_PUBLIC =
                "https://public.s3.amazonaws.com";
            process.env.PATH_PREFIX = "";
            clearModuleCache();

            const {
                getMainFileUrl,
                getThumbnailUrl,
            } = require("@/media/utils/get-public-urls");
            const media = createMockMedia({
                accessControl: Constants.AccessControl.PUBLIC,
            });

            const mainUrl = getMainFileUrl(media);
            const thumbUrl = getThumbnailUrl(media);

            // Main files use CLOUD_ENDPOINT_PUBLIC for public media
            assert.strictEqual(
                mainUrl,
                `https://public.s3.amazonaws.com/${PATH_KEY.PUBLIC}/test-media-id-123/main.jpg`,
            );
            // Thumbnails always use CLOUD_ENDPOINT_PUBLIC
            assert.strictEqual(
                thumbUrl,
                `https://public.s3.amazonaws.com/${PATH_KEY.PUBLIC}/test-media-id-123/thumb.webp`,
            );
        });
    });
});
