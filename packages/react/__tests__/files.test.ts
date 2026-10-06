import { describe, test } from "node:test";
import assert from "node:assert";
import { formatBytes, matchesAccept } from "../src/files";

describe("matchesAccept", () => {
    const png = { name: "Photo.PNG", type: "image/png" };
    const pdf = { name: "doc.pdf", type: "application/pdf" };

    test("accepts everything without a rule", () => {
        assert.ok(matchesAccept(pdf));
        assert.ok(matchesAccept(pdf, " "));
    });

    test("matches extensions, wildcards and exact types", () => {
        assert.ok(matchesAccept(png, ".png"));
        assert.ok(matchesAccept(png, "image/*"));
        assert.ok(matchesAccept(pdf, "image/*, application/pdf"));
        assert.ok(!matchesAccept(pdf, "image/*,.png"));
    });
});

describe("formatBytes", () => {
    test("formats sizes", () => {
        assert.strictEqual(formatBytes(512), "512 B");
        assert.strictEqual(formatBytes(1536), "1.5 KB");
        assert.strictEqual(formatBytes(10 * 1024 * 1024), "10 MB");
    });
});
