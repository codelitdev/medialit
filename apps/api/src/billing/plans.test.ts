import assert from "node:assert/strict";
import test from "node:test";
import { BillingConfigurationError } from "@codelitdev/billing/core";
import { Constants } from "@medialit/models";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../config/constants";
import { readCloudBillingConfig } from "./catalog";
import {
    UNLIMITED_BYTES,
    accountPlan,
    maxStorageFor,
    maxUploadFor,
} from "./entitlements";
import { profilePatchFromSubscription } from "./product-effects";
import type { CanonicalSubscription } from "@codelitdev/billing/core";

const basic = {
    subscriptionStatus: Constants.SubscriptionStatus.NOT_SUBSCRIBED,
    subscriptionEndsAfter: undefined,
};
const pro = {
    subscriptionStatus: Constants.SubscriptionStatus.SUBSCRIBED,
    subscriptionEndsAfter: undefined,
};

test("cloud keeps the current basic and pro limits", () => {
    assert.equal(accountPlan(basic, "cloud"), "basic");
    assert.equal(accountPlan(pro, "cloud"), "pro");
    assert.equal(maxStorageFor(basic, "cloud"), maxStorageAllowedNotSubscribed);
    assert.equal(maxStorageFor(pro, "cloud"), maxStorageAllowedSubscribed);
    assert.equal(maxUploadFor(basic, "cloud"), maxFileUploadSizeNotSubscribed);
    assert.equal(maxUploadFor(pro, "cloud"), maxFileUploadSizeSubscribed);
});

test("oss unlocks storage and upload size", () => {
    assert.equal(accountPlan(basic, "oss"), "oss");
    assert.equal(maxStorageFor(basic, "oss"), UNLIMITED_BYTES);
    assert.equal(maxUploadFor(pro, "oss"), UNLIMITED_BYTES);
});

test("cloud billing config stays off until Dodo is fully set", () => {
    assert.equal(
        readCloudBillingConfig({ MEDIALIT_DEPLOYMENT_MODE: "cloud" }),
        null,
    );
    assert.equal(
        readCloudBillingConfig({
            MEDIALIT_DEPLOYMENT_MODE: "oss",
            DODO_PAYMENTS_API_KEY: "test",
        }),
        null,
    );
    assert.throws(
        () =>
            readCloudBillingConfig({
                MEDIALIT_DEPLOYMENT_MODE: "cloud",
                DODO_PAYMENTS_API_KEY: "test",
            }),
        BillingConfigurationError,
    );
});

test("a complete Pro catalog is ten dollars a month or one hundred a year", () => {
    const config = readCloudBillingConfig({
        MEDIALIT_DEPLOYMENT_MODE: "cloud",
        BILLING_CATALOG_REVISION: "1",
        BILLING_CURRENCY: "usd",
        BILLING_PRO_MONTH_AMOUNT_MINOR: "1000",
        BILLING_PRO_YEAR_AMOUNT_MINOR: "10000",
        DODO_PRO_MONTH_PRODUCT_ID: "pdt_pro_month",
        DODO_PRO_YEAR_PRODUCT_ID: "pdt_pro_year",
        DODO_PAYMENTS_API_KEY: "test_key",
        DODO_PAYMENTS_WEBHOOK_KEY_CURRENT: "whsec_test",
        BILLING_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    });
    const month = config?.offers.find((offer) => offer.key === "pro_month");
    const year = config?.offers.find((offer) => offer.key === "pro_year");
    assert.equal(month?.plan, "pro");
    assert.equal(month?.interval, "month");
    assert.equal(month?.amountMinor, 1000);
    assert.equal(month?.currency, "USD");
    assert.equal(month?.provider, "dodo");
    assert.equal(year?.interval, "year");
    assert.equal(year?.amountMinor, 10000);
    assert.equal(year?.providerProductId, "pdt_pro_year");
    assert.throws(
        () =>
            readCloudBillingConfig({
                MEDIALIT_DEPLOYMENT_MODE: "cloud",
                BILLING_CATALOG_REVISION: "1",
                BILLING_CURRENCY: "USD",
                BILLING_PRO_MONTH_AMOUNT_MINOR: "1000",
                BILLING_PRO_YEAR_AMOUNT_MINOR: "10000",
                DODO_PRO_MONTH_PRODUCT_ID: "pdt_same",
                DODO_PRO_YEAR_PRODUCT_ID: "pdt_same",
                DODO_PAYMENTS_API_KEY: "test_key",
                DODO_PAYMENTS_WEBHOOK_KEY_CURRENT: "whsec_test",
                BILLING_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString(
                    "base64",
                ),
            }),
        BillingConfigurationError,
    );
});

function subscription(
    patch: Partial<CanonicalSubscription>,
): CanonicalSubscription {
    return {
        id: "sub_row",
        billableEntityId: "user_1",
        payerId: "user_1",
        provider: "dodo",
        providerCustomerId: "cus_1",
        providerSubscriptionId: "sub_1",
        providerProductId: "pdt_pro_month",
        catalogRevision: 1,
        offerKey: "pro_month",
        plan: "pro",
        interval: "month",
        priceEntryId: "price_1",
        status: "active",
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: new Date("2027-07-04T10:13:39.000Z"),
        paidThroughAt: null,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        isEntitlementSource: true,
        originCheckoutAttemptId: null,
        providerOccurredAt: null,
        providerVersion: null,
        lastObservedAt: null,
        lastReconciledAt: null,
        ...patch,
    };
}

test("an entitled Dodo subscription projects to Pro", () => {
    const patch = profilePatchFromSubscription(subscription({}));
    assert.equal(patch.subscriptionStatus, "subscribed");
    assert.equal(patch.subscriptionMethod, "dodo");
    assert.equal(patch.subscriptionId, "sub_1");
    assert.equal(
        patch.subscriptionEndsAfter?.toISOString(),
        "2027-07-04T10:13:39.000Z",
    );
});

test("a Dodo subscription that is not the entitlement source drops to Basic", () => {
    const patch = profilePatchFromSubscription(
        subscription({ isEntitlementSource: false, status: "expired" }),
    );
    assert.equal(patch.subscriptionStatus, "not-subscribed");
});
