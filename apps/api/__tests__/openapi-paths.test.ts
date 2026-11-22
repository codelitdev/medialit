import test from "node:test";
import assert from "node:assert/strict";
import swagger from "../src/swagger_output.json";

const expectedPaths = [
    "/health",
    "/media/create",
    "/media/delete/{mediaId}",
    "/media/get",
    "/media/get/count",
    "/media/get/size",
    "/media/get/{mediaId}",
    "/media/seal/{mediaId}",
    "/media/signature/create",
    "/media/{mediaId}/hls/{token}/master.m3u8",
    "/media/{mediaId}/hls/{token}/{rendition}/index.m3u8",
    "/settings/media/create",
    "/settings/media/get",
    "/settings/webhooks/create",
    "/settings/webhooks/delete",
    "/settings/webhooks/get",
    "/settings/webhooks/secret",
    "/settings/webhooks/test",
    "/settings/webhooks/update",
];

test("public OpenAPI paths stay the same", () => {
    assert.deepEqual(
        Object.keys(swagger.paths).sort(),
        [...expectedPaths].sort(),
    );
});
