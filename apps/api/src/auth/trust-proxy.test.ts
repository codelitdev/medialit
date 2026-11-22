import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { trustProxySetting } from "./trust-proxy";

describe("trustProxySetting", () => {
    test("keeps the old ENABLE_TRUST_PROXY behaviour when TRUST_PROXY is unset", () => {
        assert.equal(trustProxySetting({}), false);
        assert.equal(trustProxySetting({ ENABLE_TRUST_PROXY: "false" }), false);
        assert.equal(trustProxySetting({ ENABLE_TRUST_PROXY: "true" }), 1);
        assert.equal(
            trustProxySetting({ ENABLE_TRUST_PROXY: "true", TRUST_PROXY: " " }),
            1,
        );
    });

    test("TRUST_PROXY wins and accepts hops, booleans and subnets", () => {
        assert.equal(
            trustProxySetting({ ENABLE_TRUST_PROXY: "true", TRUST_PROXY: "2" }),
            2,
        );
        assert.equal(trustProxySetting({ TRUST_PROXY: "false" }), false);
        assert.equal(trustProxySetting({ TRUST_PROXY: "true" }), true);
        assert.equal(
            trustProxySetting({ TRUST_PROXY: "10.0.0.0/8, loopback" }),
            "10.0.0.0/8, loopback",
        );
    });
});
