import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequestsPerMinute } from "../limiters.js";

test("the REST limit is 120 a minute unless API_RATE_LIMIT_PER_MINUTE is set", () => {
    assert.equal(apiRequestsPerMinute({}), 120);
    assert.equal(apiRequestsPerMinute({ API_RATE_LIMIT_PER_MINUTE: "" }), 120);
    assert.equal(
        apiRequestsPerMinute({ API_RATE_LIMIT_PER_MINUTE: "5000" }),
        5000,
    );
    for (const bad of ["0", "-1", "1.5", "lots"]) {
        assert.throws(
            () => apiRequestsPerMinute({ API_RATE_LIMIT_PER_MINUTE: bad }),
            /positive whole number/,
        );
    }
});
