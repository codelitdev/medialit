import test from "node:test";
import { createApikey } from "../../lib/apikey/handlers";
import assert from "node:assert";

test("Create API key throws an error if name is empty", async (t) => {
    const req = {
        body: {},
    };
    const res = {
        status: () => ({
            json: (data: any) => data,
        }),
    };
    const response = await createApikey(req, res, () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    assert.strictEqual(response.error, "Name is required");
});
