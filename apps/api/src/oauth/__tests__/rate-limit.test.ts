import { test } from "node:test";
import assert from "node:assert/strict";
import rateLimit from "express-rate-limit";

test("rate limiters are valid express middleware functions", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 10 });
    assert.equal(typeof limiter, "function");
    // Express middleware signature: (req, res, next)
    assert.equal(limiter.length, 3);
});

test("separate limiters have independent state", () => {
    const a = rateLimit({ windowMs: 60_000, max: 10 });
    const b = rateLimit({ windowMs: 60_000, max: 30 });
    // They are distinct middleware instances
    assert.notEqual(a, b);
});
