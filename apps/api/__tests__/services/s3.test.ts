import { describe, test } from "node:test";
import assert from "node:assert";

describe("S3 Client Configuration", () => {
    test("should include endpoint and forcePathStyle when cloudEndpoint is set", () => {
        // Set cloudEndpoint in environment
        const originalEnv = process.env.CLOUD_ENDPOINT;
        process.env.CLOUD_ENDPOINT = "http://localhost:9000";
        process.env.CLOUD_REGION = "us-east-1";
        process.env.CLOUD_KEY = "test-key";
        process.env.CLOUD_SECRET = "test-secret";

        // Clear module cache to force re-evaluation with new env
        const modulePath = require.resolve("../../src/services/s3");
        const constantsPath = require.resolve("../../src/config/constants");
        delete require.cache[modulePath];
        delete require.cache[constantsPath];

        // Re-import to get fresh config
        const { s3ClientConfig } = require("../../src/services/s3");

        // Verify config structure
        assert.ok(
            s3ClientConfig !== undefined,
            "s3ClientConfig should be defined",
        );
        assert.strictEqual(
            s3ClientConfig.endpoint,
            "http://localhost:9000",
            "endpoint should be set when cloudEndpoint is provided",
        );
        assert.strictEqual(
            s3ClientConfig.forcePathStyle,
            true,
            "forcePathStyle should be true when cloudEndpoint is provided",
        );

        // Restore original env
        if (originalEnv !== undefined) {
            process.env.CLOUD_ENDPOINT = originalEnv;
        } else {
            delete process.env.CLOUD_ENDPOINT;
        }
    });

    test("should not include endpoint or forcePathStyle when cloudEndpoint is not set", () => {
        // Unset cloudEndpoint
        const originalEnv = process.env.CLOUD_ENDPOINT;
        delete process.env.CLOUD_ENDPOINT;
        process.env.CLOUD_REGION = "us-east-1";
        process.env.CLOUD_KEY = "test-key";
        process.env.CLOUD_SECRET = "test-secret";

        // Clear module cache
        const modulePath = require.resolve("../../src/services/s3");
        const constantsPath = require.resolve("../../src/config/constants");
        delete require.cache[modulePath];
        delete require.cache[constantsPath];

        // Re-import to get fresh config
        const { s3ClientConfig } = require("../../src/services/s3");

        // Verify config structure
        assert.ok(
            s3ClientConfig !== undefined,
            "s3ClientConfig should be defined",
        );
        assert.strictEqual(
            s3ClientConfig.endpoint,
            undefined,
            "endpoint should not be set when cloudEndpoint is not provided",
        );
        assert.strictEqual(
            s3ClientConfig.forcePathStyle,
            undefined,
            "forcePathStyle should not be set when cloudEndpoint is not provided",
        );

        // Restore original env
        if (originalEnv !== undefined) {
            process.env.CLOUD_ENDPOINT = originalEnv;
        }
    });
});
