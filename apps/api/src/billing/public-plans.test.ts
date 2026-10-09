import assert from "node:assert/strict";
import test from "node:test";
import {
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
} from "../config/constants";
import { billingPlans } from "./public-plans";

const offer = (
    key: string,
    interval: "month" | "year",
    amountMinor: number,
) => ({
    key,
    plan: "pro",
    interval,
    amountMinor,
    currency: "USD",
    displayTrialDays: 0,
});

test("takes Pro prices from the billing catalog", () => {
    const plans = billingPlans({
        revision: 1,
        currency: "USD",
        checkoutAvailable: true,
        offers: [
            offer("pro_month", "month", 1000),
            offer("pro_year", "year", 10000),
        ],
    });
    assert.equal(plans.checkoutAvailable, true);
    assert.equal(plans.currency, "USD");
    assert.deepEqual(plans.plans.pro.prices, { month: 1000, year: 10000 });
});

test("takes limits from the enforced settings", () => {
    const plans = billingPlans(null);
    assert.equal(
        plans.plans.basic.limits.storageBytes,
        maxStorageAllowedNotSubscribed,
    );
    assert.equal(
        plans.plans.pro.limits.maxUploadBytes,
        maxFileUploadSizeSubscribed,
    );
});

test("has no prices and no checkout without a complete catalog", () => {
    assert.equal(billingPlans(null).plans.pro.prices, null);
    assert.equal(billingPlans(null).checkoutAvailable, false);
    const partial = billingPlans({
        revision: 1,
        currency: "USD",
        checkoutAvailable: true,
        offers: [offer("pro_month", "month", 1000)],
    });
    assert.equal(partial.plans.pro.prices, null);
    assert.equal(partial.checkoutAvailable, false);
    assert.equal(partial.currency, null);
});
