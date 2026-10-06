import { describe, test, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { createSignatureHandler } from "../src";

describe("createSignatureHandler", () => {
    const request = () =>
        new Request("http://app.test/api/medialit/signature", {
            method: "POST",
        });

    let fetchMock: ReturnType<typeof mock.fn>;
    beforeEach(() => {
        mock.restoreAll();
        fetchMock = mock.fn(
            async () =>
                new Response(JSON.stringify({ signature: "sig-123" }), {
                    status: 200,
                }),
        );
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    test("refuses the request when authorize returns false", async () => {
        const handler = createSignatureHandler({
            apiKey: "key",
            authorize: () => false,
        });
        const response = await handler(request());
        assert.strictEqual(response.status, 401);
        assert.deepStrictEqual(await response.json(), {
            error: "Unauthorized",
        });
        assert.strictEqual(fetchMock.mock.calls.length, 0);
    });

    test("returns the signature and endpoint", async () => {
        const handler = createSignatureHandler({
            apiKey: "key",
            endpoint: "http://medialit.internal",
            authorize: async () => true,
        });
        const response = await handler(request());
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(await response.json(), {
            signature: "sig-123",
            endpoint: "http://medialit.internal",
        });

        const [url, init] = fetchMock.mock.calls[0].arguments as [
            string,
            RequestInit,
        ];
        assert.strictEqual(
            url,
            "http://medialit.internal/media/signature/create",
        );
        assert.strictEqual(
            (init.headers as Record<string, string>)["x-medialit-apikey"],
            "key",
        );
        assert.strictEqual(init.body, "{}");
    });

    test("passes the group and the public endpoint", async () => {
        const handler = createSignatureHandler({
            apiKey: "key",
            endpoint: "http://medialit.internal",
            publicEndpoint: "https://media.example.com",
            authorize: () => ({ group: "team-1" }),
        });
        const body = await (await handler(request())).json();
        assert.strictEqual(body.endpoint, "https://media.example.com");

        const [, init] = fetchMock.mock.calls[0].arguments as [
            string,
            RequestInit,
        ];
        assert.strictEqual(init.body, JSON.stringify({ group: "team-1" }));
    });

    test("returns 500 with MediaLit's error", async () => {
        global.fetch = (async () =>
            new Response(JSON.stringify({ message: "Invalid API key" }), {
                status: 401,
            })) as typeof fetch;
        const handler = createSignatureHandler({
            apiKey: "key",
            authorize: () => true,
        });
        const response = await handler(request());
        assert.strictEqual(response.status, 500);
        assert.deepStrictEqual(await response.json(), {
            error: "Invalid API key",
        });
    });

    test("does not need the API key until a request arrives", async () => {
        const previous = process.env.MEDIALIT_API_KEY;
        delete process.env.MEDIALIT_API_KEY;
        try {
            const handler = createSignatureHandler({ authorize: () => true });
            const response = await handler(request());
            assert.strictEqual(response.status, 500);
            assert.match((await response.json()).error, /API Key is required/);
        } finally {
            if (previous !== undefined) process.env.MEDIALIT_API_KEY = previous;
        }
    });
});
