import assert from "node:assert";
import test, { describe } from "node:test";
import {
    createConfiguredProvider,
    createConfiguredProviders,
    dodoOptionsFromEnv,
} from "./providers";

describe("billing providers", () => {
    test("builds the configured provider", () => {
        const lemonSqueezy = createConfiguredProvider("lemonsqueezy", {
            LEMONSQUEEZY_API_KEY: "ls_key",
            LEMONSQUEEZY_STORE_ID: "123",
            LEMONSQUEEZY_WEBHOOK_SECRET: "secret",
        });
        assert.strictEqual(lemonSqueezy.provider, "lemonsqueezy");
        const dodo = createConfiguredProvider("dodo", {
            DODO_PAYMENTS_API_KEY: "dodo_key",
            DODO_PAYMENTS_WEBHOOK_KEY_CURRENT: "whsec_x",
        });
        assert.strictEqual(dodo.provider, "dodo");
    });

    test("builds every connected provider, checkout provider first", () => {
        const adapters = createConfiguredProviders(["dodo", "lemonsqueezy"], {
            DODO_PAYMENTS_API_KEY: "dodo_key",
            DODO_PAYMENTS_WEBHOOK_KEY_CURRENT: "whsec_x",
            LEMONSQUEEZY_API_KEY: "ls_key",
            LEMONSQUEEZY_STORE_ID: "123",
            LEMONSQUEEZY_WEBHOOK_SECRET: "secret",
        });
        assert.deepStrictEqual(
            adapters.map((adapter) => adapter.provider),
            ["dodo", "lemonsqueezy"],
        );
    });

    test("passes DODO_BRAND_ID to the Dodo provider", () => {
        assert.strictEqual(
            dodoOptionsFromEnv({ DODO_BRAND_ID: " bus_1 " }).brandId,
            "bus_1",
        );
        assert.strictEqual(dodoOptionsFromEnv({}).brandId, undefined);
    });
});
