import assert from "node:assert/strict";
import { test } from "node:test";
import router from "./routes";

type Layer = {
    route?: {
        path: string;
        stack: { name: string; handle: (...args: any[]) => unknown }[];
    };
};

/** Runs a route's scope check with a token that has `scopes`, skipping
 * the rate limiter and the API-key middleware before it. */
function scopeCheck(path: string, scopes: string[]) {
    const layer = (router.stack as unknown as Layer[]).find(
        (entry) => entry.route?.path === path,
    );
    assert.ok(layer?.route, `no route ${path}`);
    // Each route is: rate limiter, API-key auth, scope check, handler.
    const check = layer.route.stack[2].handle;
    let status = 200;
    let passed = false;
    const res = {
        setHeader: () => undefined,
        status(code: number) {
            status = code;
            return this;
        },
        json() {
            return this;
        },
    };
    check({ scopes }, res, () => {
        passed = true;
    });
    return { passed, status };
}

test("a read-only token can list endpoints but not reveal a secret or change anything", () => {
    assert.deepEqual(scopeCheck("/get", ["data:read"]), {
        passed: true,
        status: 200,
    });
    for (const path of ["/secret", "/create", "/update", "/delete", "/test"]) {
        assert.deepEqual(
            scopeCheck(path, ["data:read"]),
            { passed: false, status: 403 },
            path,
        );
        assert.equal(scopeCheck(path, ["data:write"]).passed, true, path);
    }
});
