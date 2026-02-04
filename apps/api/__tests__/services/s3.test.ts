import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

// Helper to clear module cache and re-import
const clearModuleCache = () => {
    const modulePath = require.resolve("@/services/s3");
    const constantsPath = require.resolve("@/config/constants");
    delete require.cache[modulePath];
    delete require.cache[constantsPath];
};

describe("S3 Client Configuration", () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        // Save original env vars
        originalEnv.CLOUD_ENDPOINT = process.env.CLOUD_ENDPOINT;
        originalEnv.CLOUD_ENDPOINT_PUBLIC = process.env.CLOUD_ENDPOINT_PUBLIC;
        originalEnv.CLOUD_BUCKET_NAME = process.env.CLOUD_BUCKET_NAME;
        originalEnv.CLOUD_PUBLIC_BUCKET_NAME =
            process.env.CLOUD_PUBLIC_BUCKET_NAME;
    });

    afterEach(() => {
        // Restore original env vars
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
        if (originalEnv.CLOUD_BUCKET_NAME !== undefined) {
            process.env.CLOUD_BUCKET_NAME = originalEnv.CLOUD_BUCKET_NAME;
        } else {
            delete process.env.CLOUD_BUCKET_NAME;
        }
        if (originalEnv.CLOUD_PUBLIC_BUCKET_NAME !== undefined) {
            process.env.CLOUD_PUBLIC_BUCKET_NAME =
                originalEnv.CLOUD_PUBLIC_BUCKET_NAME;
        } else {
            delete process.env.CLOUD_PUBLIC_BUCKET_NAME;
        }
        clearModuleCache();
    });

    describe("Private S3 Client Config", () => {
        test("should include endpoint and forcePathStyle when CLOUD_ENDPOINT is set (non-AWS)", () => {
            process.env.CLOUD_ENDPOINT = "http://localhost:9000";
            process.env.CLOUD_REGION = "us-east-1";
            process.env.CLOUD_KEY = "test-key";
            process.env.CLOUD_SECRET = "test-secret";
            process.env.CLOUD_BUCKET_NAME = "test-bucket";
            clearModuleCache();

            const { getPrivateS3ClientConfig } = require("@/services/s3");
            const config = getPrivateS3ClientConfig();

            assert.ok(config !== undefined, "config should be defined");
            assert.strictEqual(
                config.endpoint,
                "http://localhost:9000",
                "endpoint should be set when CLOUD_ENDPOINT is provided",
            );
            assert.strictEqual(
                config.forcePathStyle,
                true,
                "forcePathStyle should be true for non-AWS endpoints",
            );
        });

        test("should not include endpoint or forcePathStyle when CLOUD_ENDPOINT is not set", () => {
            delete process.env.CLOUD_ENDPOINT;
            process.env.CLOUD_REGION = "us-east-1";
            process.env.CLOUD_KEY = "test-key";
            process.env.CLOUD_SECRET = "test-secret";
            process.env.CLOUD_BUCKET_NAME = "test-bucket";
            clearModuleCache();

            const { getPrivateS3ClientConfig } = require("@/services/s3");
            const config = getPrivateS3ClientConfig();

            assert.ok(config !== undefined, "config should be defined");
            assert.strictEqual(
                config.endpoint,
                undefined,
                "endpoint should not be set when CLOUD_ENDPOINT is not provided",
            );
            assert.strictEqual(
                config.forcePathStyle,
                undefined,
                "forcePathStyle should not be set when CLOUD_ENDPOINT is not provided",
            );
        });
    });

    describe("Public S3 Client Config", () => {
        test("should include endpoint and forcePathStyle when CLOUD_ENDPOINT_PUBLIC is set (non-AWS)", () => {
            process.env.CLOUD_ENDPOINT_PUBLIC = "http://localhost:9001";
            process.env.CLOUD_REGION = "us-east-1";
            process.env.CLOUD_KEY = "test-key";
            process.env.CLOUD_SECRET = "test-secret";
            process.env.CLOUD_PUBLIC_BUCKET_NAME = "test-public-bucket";
            clearModuleCache();

            const { getPublicS3ClientConfig } = require("@/services/s3");
            const config = getPublicS3ClientConfig();

            assert.ok(config !== undefined, "config should be defined");
            assert.strictEqual(
                config.endpoint,
                "http://localhost:9001",
                "endpoint should be set when CLOUD_ENDPOINT_PUBLIC is provided",
            );
            assert.strictEqual(
                config.forcePathStyle,
                true,
                "forcePathStyle should be true for non-AWS endpoints",
            );
        });

        test("should not include endpoint or forcePathStyle when CLOUD_ENDPOINT_PUBLIC is not set", () => {
            delete process.env.CLOUD_ENDPOINT_PUBLIC;
            process.env.CLOUD_REGION = "us-east-1";
            process.env.CLOUD_KEY = "test-key";
            process.env.CLOUD_SECRET = "test-secret";
            process.env.CLOUD_PUBLIC_BUCKET_NAME = "test-public-bucket";
            clearModuleCache();

            const { getPublicS3ClientConfig } = require("@/services/s3");
            const config = getPublicS3ClientConfig();

            assert.ok(config !== undefined, "config should be defined");
            assert.strictEqual(
                config.endpoint,
                undefined,
                "endpoint should not be set when CLOUD_ENDPOINT_PUBLIC is not provided",
            );
            assert.strictEqual(
                config.forcePathStyle,
                undefined,
                "forcePathStyle should not be set when CLOUD_ENDPOINT_PUBLIC is not provided",
            );
        });
    });
});
