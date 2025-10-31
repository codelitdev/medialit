import { Constants } from "@medialit/models";
import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import storageValidation from "../../src/media/storage-middleware";
import mediaQueries from "../../src/media/queries";
import {
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../../src/config/constants";
import { NOT_ENOUGH_STORAGE } from "../../src/config/strings";

describe("storageValidation middleware", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("should allow upload when user has enough space (non-subscribed)", async () => {
        const req = {
            user: {
                id: "test-user-id",
                subscriptionStatus: Constants.SubscriptionStatus.NOT_SUBSCRIBED,
            },
            files: {
                file: {
                    size: 1024 * 1024, // 1MB
                },
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ code, data }),
            }),
        };

        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => 4 * 1024 * 1024, // 4MB used
        );

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        const response = await storageValidation(req, res, next);
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(response, undefined);
    });

    test("should allow upload when user has enough space (subscribed)", async () => {
        const req = {
            user: {
                id: "test-user-id",
                subscriptionStatus: Constants.SubscriptionStatus.SUBSCRIBED,
            },
            files: {
                file: {
                    size: 1024 * 1024, // 1MB
                },
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ code, data }),
            }),
        };

        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => 9 * 1024 * 1024, // 9MB used
        );

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        const response = await storageValidation(req, res, next);
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(response, undefined);
    });

    test("should reject upload when user exceeds storage limit (non-subscribed)", async () => {
        const req = {
            user: {
                id: "test-user-id",
                subscriptionStatus: Constants.SubscriptionStatus.NOT_SUBSCRIBED,
            },
            files: {
                file: {
                    size: 1024 * 1024 * 2, // 2MB
                },
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ code, data }),
            }),
        };

        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => maxStorageAllowedNotSubscribed - 1024 * 1024, // 1MB remaining
        );

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        const response = await storageValidation(req, res, next);
        assert.strictEqual(response.code, 403);
        assert.strictEqual(response.data.error, NOT_ENOUGH_STORAGE);
        assert.strictEqual(nextCalled, false);
    });

    test("should reject upload when user exceeds storage limit (subscribed)", async () => {
        const req = {
            user: {
                id: "test-user-id",
                subscriptionStatus: Constants.SubscriptionStatus.SUBSCRIBED,
            },
            files: {
                file: {
                    size: 1024 * 1024 * 2, // 2MB
                },
            },
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ code, data }),
            }),
        };

        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => maxStorageAllowedSubscribed - 1024 * 1024, // Remaining space is 1MB
        );

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        const response = await storageValidation(req, res, next);
        assert.strictEqual(response.code, 403);
        assert.strictEqual(response.data.error, NOT_ENOUGH_STORAGE);
        assert.strictEqual(nextCalled, false);
    });

    test("should handle missing file in request", async () => {
        const req = {
            user: {
                id: "test-user-id",
                subscriptionStatus: Constants.SubscriptionStatus.NOT_SUBSCRIBED,
            },
            files: {},
        };

        const res = {
            status: (code: number) => ({
                json: (data: any) => ({ code, data }),
            }),
        };

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        const response = await storageValidation(req, res, next);
        assert.strictEqual(response.code, 400);
        assert.strictEqual(response.data.error, "No file uploaded");
        assert.strictEqual(nextCalled, false);
    });
});
