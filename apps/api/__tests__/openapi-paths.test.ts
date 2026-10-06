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
    "/settings/media/create",
    "/settings/media/get",
];

test("public OpenAPI paths stay the same", () => {
    assert.deepEqual(
        Object.keys(swagger.paths).sort(),
        [...expectedPaths].sort(),
    );
});
