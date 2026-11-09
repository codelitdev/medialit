import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import {
    hasEnoughStorage,
    validateUploadConstraints,
} from "../../src/media/storage-middleware";
import { billingStateSource } from "../../src/billing/entitlements";
import mediaQueries from "../../src/media/queries";
import {
    maxFileUploadSizeNotSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../../src/config/constants";
import {
    FILE_SIZE_EXCEEDED,
    NOT_ENOUGH_STORAGE,
} from "../../src/config/strings";

const user = { _id: "test-user-id" } as any;

/** The billing engine reports an active Pro subscription. */
function mockPaidPlan() {
    mock.method(billingStateSource, "read").mock.mockImplementation(
        async () => ({
            activePaidPlan: "pro",
            provider: "lemonsqueezy",
            billingInterval: "month" as const,
            subscriptionStatus: "active",
            providerTrialEndsAt: null,
            currentPeriodEndsAt: null,
            paidThroughAt: null,
            cancelAtPeriodEnd: false,
            pendingCheckout: false,
            pendingPlanChange: false,
            projectionVersion: 1,
        }),
    );
}

function mockUsedSpace(bytes: number) {
    mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
        async () => bytes,
    );
}

describe("validateUploadConstraints", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("allows an upload that fits (non-subscribed)", async () => {
        mockUsedSpace(4 * 1024 * 1024);
        const result = await validateUploadConstraints({
            size: 1024 * 1024,
            user,
        });
        assert.deepStrictEqual(result, { valid: true });
    });

    test("allows an upload that fits (subscribed)", async () => {
        mockPaidPlan();
        mockUsedSpace(9 * 1024 * 1024);
        const result = await validateUploadConstraints({
            size: 1024 * 1024,
            user,
        });
        assert.deepStrictEqual(result, { valid: true });
    });

    test("rejects an upload over the remaining storage (non-subscribed)", async () => {
        mockUsedSpace(maxStorageAllowedNotSubscribed - 1024);
        const result = await validateUploadConstraints({
            size: 1024 * 1024,
            user,
        });
        assert.deepStrictEqual(result, {
            valid: false,
            reason: "not_enough_storage",
            error: NOT_ENOUGH_STORAGE,
        });
    });

    test("rejects a file over the plan's upload size limit", async () => {
        mockUsedSpace(0);
        const result = await validateUploadConstraints({
            size: maxFileUploadSizeNotSubscribed + 1,
            user,
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(
            !result.valid && result.error,
            `${FILE_SIZE_EXCEEDED}. Allowed: ${maxFileUploadSizeNotSubscribed} bytes`,
        );
    });

    test("rejects an upload over the remaining storage (subscribed)", async () => {
        mockPaidPlan();
        mockUsedSpace(maxStorageAllowedSubscribed - 1024 * 1024);
        const result = await validateUploadConstraints({
            size: 2 * 1024 * 1024,
            user,
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(
            !result.valid && result.reason,
            "not_enough_storage",
        );
    });
});

describe("hasEnoughStorage", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("allows filling storage exactly to the limit", async () => {
        mockUsedSpace(maxStorageAllowedNotSubscribed - 10);
        assert.strictEqual(await hasEnoughStorage(10, user), true);
        assert.strictEqual(await hasEnoughStorage(11, user), false);
    });
});
