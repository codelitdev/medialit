import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeTimelineCursor, encodeTimelineCursor } from "./timeline-cursor";

describe("timeline cursor", () => {
    test("round-trips a position", () => {
        const at = new Date("2026-10-30T14:02:11.123Z");
        assert.deepEqual(
            decodeTimelineCursor(encodeTimelineCursor({ at, id: "abc-1" })),
            { at, id: "abc-1" },
        );
    });

    test("rejects anything this server did not issue", () => {
        const forged = (value: unknown) =>
            Buffer.from(JSON.stringify(value)).toString("base64url");
        for (const bad of [
            "",
            "not a cursor",
            forged("string"),
            forged(["2026-01-01T00:00:00.000Z"]),
            forged(["yesterday", "id"]),
            forged(["2026-01-01T00:00:00.000Z", ""]),
            forged(["2026-01-01T00:00:00.000Z", 7]),
        ]) {
            assert.equal(decodeTimelineCursor(bad), null, bad);
        }
    });
});
