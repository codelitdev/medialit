import assert from "node:assert";
import test, { describe } from "node:test";
import { dodoOptionsFromEnv } from "./dodo";

describe("dodoOptionsFromEnv", () => {
    test("passes DODO_BRAND_ID to the provider", () => {
        const options = dodoOptionsFromEnv({ DODO_BRAND_ID: " bus_medialit " });
        assert.strictEqual(options.brandId, "bus_medialit");
    });

    test("leaves the brand unset when DODO_BRAND_ID is empty", () => {
        assert.strictEqual(dodoOptionsFromEnv({}).brandId, undefined);
        assert.strictEqual(
            dodoOptionsFromEnv({ DODO_BRAND_ID: "  " }).brandId,
            undefined,
        );
    });
});
