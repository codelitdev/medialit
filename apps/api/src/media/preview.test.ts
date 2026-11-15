import assert from "node:assert/strict";
import { test } from "node:test";
import { isTextPreview, mediaPreview } from "./preview";

test("markdown is recognised by MIME type or, when vague, by extension", () => {
    assert.equal(mediaPreview("text/markdown", "notes.txt"), "markdown");
    assert.equal(
        mediaPreview("text/x-markdown; charset=utf-8", "a"),
        "markdown",
    );
    assert.equal(mediaPreview("text/plain", "README.md"), "markdown");
    assert.equal(
        mediaPreview("application/octet-stream", "Guide.MARKDOWN"),
        "markdown",
    );
    assert.equal(mediaPreview("", "notes.md"), "markdown");
});

test("other files get no native preview", () => {
    assert.equal(mediaPreview("text/plain", "notes.txt"), null);
    assert.equal(mediaPreview("image/png", "diagram.md"), null);
    assert.equal(mediaPreview("application/pdf", "doc.pdf"), null);
    assert.equal(isTextPreview(null), false);
    assert.equal(isTextPreview("markdown"), true);
});
