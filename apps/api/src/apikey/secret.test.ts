import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
    API_KEY_PREFIX,
    displayPrefix,
    generateApiKeySecret,
    hashApiKeySecret,
} from "./secret";

test("keys carry the ml_live_ prefix and 256 random bits", () => {
    const secret = generateApiKeySecret();
    assert.ok(secret.startsWith(API_KEY_PREFIX));
    const random = secret.slice(API_KEY_PREFIX.length);
    assert.match(random, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(random, "base64url").length, 32);
    assert.notEqual(generateApiKeySecret(), secret);
});

test("hashes with SHA-256 hex", () => {
    assert.equal(
        hashApiKeySecret("ml_live_example"),
        createHash("sha256").update("ml_live_example").digest("hex"),
    );
});

test("shows the prefix and four characters of the secret", () => {
    assert.equal(displayPrefix("ml_live_abcdefgh"), "ml_live_abcd");
});
