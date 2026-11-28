import { test } from "node:test";
import assert from "node:assert/strict";
import { isOverride, withOverride } from "./processing-plan.js";
import { sealMediaSchema } from "./schemas.js";

const app = {
    videoStreaming: "hls" as const,
    hlsRenditions: ["720p" as const],
};

test("an override replaces only the fields it sets", () => {
    assert.deepEqual(withOverride(app, { videoStreaming: "off" }), {
        videoStreaming: "off",
        hlsRenditions: ["720p"],
    });
    assert.deepEqual(withOverride(app, {}), app);
    assert.deepEqual(withOverride(app, undefined), app);
    assert.equal(isOverride({ videoStreaming: "mp4" }), true);
    assert.equal(isOverride({}), false);
    assert.equal(isOverride(undefined), false);
});

test("the seal body: optional, with a strict processing object", () => {
    const valid = (body: unknown) => !sealMediaSchema.validate(body).error;
    // Clients from before phase 2 send nothing, or other fields.
    assert.ok(valid({}));
    assert.ok(valid({ somethingElse: 1 }));
    assert.ok(valid({ processing: null }));
    assert.ok(valid({ processing: {} }));
    assert.ok(valid({ processing: { videoStreaming: "off" } }));
    assert.ok(valid({ processing: { videoStreaming: "mp4" } }));
    // A typo or a bad value is refused, not ignored.
    assert.ok(!valid({ processing: { videoStreming: "off" } }));
    assert.ok(!valid({ processing: { videoStreaming: "dash" } }));
    assert.ok(!valid({ processing: "off" }));
});
