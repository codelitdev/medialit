import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import { BillingConfigurationError } from "@codelitdev/billing/core";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../config/constants";
import { billingComposition, readCloudBillingConfig } from "./catalog";
import { billingEngineCheckout } from "./engine";
import { createBilling } from "@codelitdev/billing/workflows";
import { systemClock } from "@codelitdev/billing/core";
import { MemoryAuthorizationPort } from "@codelitdev/billing/workflows";
import type { CommercialBillingState } from "@codelitdev/billing/workflows";
import {
    UNLIMITED_BYTES,
    accountSubscription,
    billingStateSource,
    maxStorageFor,
    maxUploadFor,
    resolveAccountBilling,
    resolveAccountPlan,
} from "./entitlements";

const user = { id: "user_1" };

function state(
    patch: Partial<CommercialBillingState> = {},
): CommercialBillingState {
    return {
        activePaidPlan: "pro",
        billingInterval: "month",
        subscriptionStatus: "active",
        providerTrialEndsAt: null,
        currentPeriodEndsAt: new Date("2027-07-04T10:13:39.000Z"),
        paidThroughAt: new Date("2027-07-04T10:13:39.000Z"),
        cancelAtPeriodEnd: false,
        pendingCheckout: false,
        pendingPlanChange: false,
        projectionVersion: 1,
        ...patch,
    };
}

function billingReturns(value: CommercialBillingState | null) {
    mock.method(billingStateSource, "read").mock.mockImplementation(
        async () => value,
    );
}

afterEach(() => mock.restoreAll());

test("cloud plans and limits come only from billing", async () => {
    billingReturns(null);
    assert.equal(await resolveAccountPlan(user, "cloud"), "basic");
    assert.equal(
        await maxStorageFor(user, "cloud"),
        maxStorageAllowedNotSubscribed,
    );
    assert.equal(
        await maxUploadFor(user, "cloud"),
        maxFileUploadSizeNotSubscribed,
    );

    billingReturns(state({ activePaidPlan: null }));
    assert.equal(await resolveAccountPlan(user, "cloud"), "basic");

    billingReturns(state());
    assert.equal(await resolveAccountPlan(user, "cloud"), "pro");
    assert.equal(
        await maxStorageFor(user, "cloud"),
        maxStorageAllowedSubscribed,
    );
    assert.equal(
        await maxUploadFor(user, "cloud"),
        maxFileUploadSizeSubscribed,
    );
});

test("oss unlocks storage and upload size without reading billing", async () => {
    billingReturns(state());
    assert.equal(await resolveAccountPlan(user, "oss"), "oss");
    assert.equal(await maxStorageFor(user, "oss"), UNLIMITED_BYTES);
    assert.equal(await maxUploadFor(user, "oss"), UNLIMITED_BYTES);
    assert.equal(
        (
            billingStateSource.read as unknown as {
                mock: { callCount(): number };
            }
        ).mock.callCount(),
        0,
    );
});

test("the dashboard shows a scheduled cancellation with its end date", async () => {
    billingReturns(state({ cancelAtPeriodEnd: true }));
    const account = await resolveAccountBilling(user, "cloud");
    assert.equal(account.plan, "pro");
    const subscription = accountSubscription(account);
    assert.equal(subscription?.status, "cancelling");
    assert.equal(subscription?.interval, "month");
    assert.equal(
        subscription?.paidThroughAt?.toISOString(),
        "2027-07-04T10:13:39.000Z",
    );

    billingReturns(state({ subscriptionStatus: "past_due" }));
    assert.equal(
        accountSubscription(await resolveAccountBilling(user, "cloud"))?.status,
        "past_due",
    );

    billingReturns(null);
    assert.equal(
        accountSubscription(await resolveAccountBilling(user, "cloud")),
        null,
    );
});

test("cloud billing config stays off until Dodo is fully set", () => {
    assert.equal(
        readCloudBillingConfig({ MEDIALIT_DEPLOYMENT_MODE: "cloud" }),
        null,
    );
    assert.equal(
        billingComposition({ MEDIALIT_DEPLOYMENT_MODE: "cloud" })
            .deploymentMode,
        "oss",
    );
    assert.equal(billingComposition({}).deploymentMode, "oss");
    assert.equal(
        readCloudBillingConfig({
            MEDIALIT_DEPLOYMENT_MODE: "oss",
            DODO_PAYMENTS_API_KEY: "test",
        }),
        null,
    );
    const ossCheckout = billingEngineCheckout({ deploymentMode: "oss" });
    assert.equal(ossCheckout.mode, "oss");
    assert.equal(ossCheckout.checkoutProvider, "");
    assert.equal(ossCheckout.requestedRevision, null);
    assert.deepEqual(ossCheckout.requiredOfferKeys, []);
    assert.deepEqual(ossCheckout.offers, []);
    assert.doesNotThrow(() =>
        createBilling({
            clock: systemClock,
            authorization: new MemoryAuthorizationPort(),
            providers: [],
            ...ossCheckout,
        }),
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
