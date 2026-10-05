import { describe, test, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { MediaLit } from "../src";
import { Readable } from "stream";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Media } from "@medialit/models";

describe("MediaLit", () => {
    const mockApiKey = "test-api-key";
    const mockEndpoint = "https://test-api.medialit.cloud";

    // Mock window and document to simulate browser environment
    const mockBrowserGlobals = () => {
        (global as any).window = {};
        (global as any).document = {};
    };

    const cleanupBrowserGlobals = () => {
        delete (global as any).window;
        delete (global as any).document;
    };

    beforeEach(() => {
        cleanupBrowserGlobals();
        mock.restoreAll();
    });

    describe("constructor", () => {
        test("should throw error when running in browser environment", () => {
            mockBrowserGlobals();
            assert.throws(() => {
                new MediaLit({ apiKey: mockApiKey });
            }, /MediaLit SDK is only meant to be used in a server-side Node.js environment/);
            cleanupBrowserGlobals();
        });

        test("should throw error when API key is not provided", () => {
            assert.throws(() => {
                new MediaLit({});
            }, /API Key is required/);
        });

        test("should send an access token instead of an API key", async () => {
            const previous = process.env.MEDIALIT_API_KEY;
            delete process.env.MEDIALIT_API_KEY;
            try {
                const fetchMock = mock.fn(
                    async () =>
                        ({
                            ok: true,
                            json: async () => ({ count: 3 }),
                        }) as Response,
                );
                global.fetch = fetchMock;
                const client = new MediaLit({ accessToken: "token-1" });
                assert.strictEqual(await client.getCount(), 3);
                const [, init] = fetchMock.mock.calls[0]
                    .arguments as unknown as [string, RequestInit];
                const headers = init.headers as Record<string, string>;
                assert.strictEqual(headers.authorization, "Bearer token-1");
                assert.strictEqual(headers["x-medialit-apikey"], undefined);
            } finally {
                if (previous !== undefined)
                    process.env.MEDIALIT_API_KEY = previous;
            }
        });

        test("should initialize with provided config", () => {
            const client = new MediaLit({
                apiKey: mockApiKey,
                endpoint: mockEndpoint,
            });
            assert.strictEqual((client as any).apiKey, mockApiKey);
            assert.strictEqual((client as any).endpoint, mockEndpoint);
        });
    });

    describe("upload", () => {
        test("should upload file from path successfully", async () => {
            const client = new MediaLit({ apiKey: mockApiKey });
            const mockResponse: Media = {
                mediaId: "test-id",
                fileName: "test.txt",
                originalFileName: "test.txt",
                mimeType: "text/plain",
                size: 12,
                thumbnailGenerated: false,
                accessControl: "private",
                apikey: mockApiKey,
            };

            const fetchMock = mock.fn(
                async () =>
                    ({
                        ok: true,
                        json: async () => mockResponse,
                    }) as Response,
            );

            global.fetch = fetchMock;

            const dir = await mkdtemp(join(tmpdir(), "medialit-"));
            const path = join(dir, "test.txt");
            await writeFile(path, "test content");
            try {
                const result = await client.upload(path, { access: "public" });
                assert.deepStrictEqual(result, mockResponse);
                assert.strictEqual(fetchMock.mock.calls.length, 1);

                // Node's fetch only sends its own FormData.
                const [, init] = fetchMock.mock.calls[0]
                    .arguments as unknown as [string, RequestInit];
                assert.ok(init.body instanceof FormData);
                const file = init.body.get("file") as File;
                assert.strictEqual(file.name, "test.txt");
                assert.strictEqual(file.type, "text/plain");
                assert.strictEqual(await file.text(), "test content");
                assert.strictEqual(init.body.get("access"), "public");
            } finally {
                await rm(dir, { recursive: true });
            }
        });

        test("should use the given file name and type", async () => {
            const client = new MediaLit({ apiKey: mockApiKey });
            const fetchMock = mock.fn(
                async () => ({ ok: true, json: async () => ({}) }) as Response,
            );
            global.fetch = fetchMock;

            await client.upload(Buffer.from("x"), { fileName: "photo.png" });
            await client.upload(Buffer.from("x"), {
                fileName: "data",
                mimeType: "application/json",
            });

            const files = fetchMock.mock.calls.map(
                (call) =>
                    (
                        (call.arguments as unknown as [string, RequestInit])[1]
                            .body as FormData
                    ).get("file") as File,
            );
            assert.strictEqual(files[0].name, "photo.png");
            assert.strictEqual(files[0].type, "image/png");
            assert.strictEqual(files[1].type, "application/json");
        });

        test("should upload buffer successfully", async () => {
            const client = new MediaLit({ apiKey: mockApiKey });
            const buffer = Buffer.from("test content");
            const mockResponse: Media = {
                mediaId: "test-id",
                fileName: "buffer",
                originalFileName: "buffer",
                mimeType: "application/octet-stream",
                size: 12,
                thumbnailGenerated: false,
                accessControl: "private",
                apikey: mockApiKey,
            };

            const fetchMock = mock.fn(
                async () =>
                    ({
                        ok: true,
                        json: async () => mockResponse,
                    }) as Response,
            );

            global.fetch = fetchMock;

            const result = await client.upload(buffer);
            assert.deepStrictEqual(result, mockResponse);
            assert.strictEqual(fetchMock.mock.calls.length, 1);
        });

        test("should upload stream successfully", async () => {
            const client = new MediaLit({ apiKey: mockApiKey });
            const stream = new Readable();
            stream.push("test content");
            stream.push(null);

            const mockResponse: Media = {
                mediaId: "test-id",
                fileName: "stream",
                originalFileName: "stream",
                mimeType: "application/octet-stream",
                size: 12,
                thumbnailGenerated: false,
                accessControl: "private",
                apikey: mockApiKey,
            };

            const fetchMock = mock.fn(
                async () =>
                    ({
                        ok: true,
                        json: async () => mockResponse,
                    }) as Response,
            );

            global.fetch = fetchMock;

            const result = await client.upload(stream);
            assert.deepStrictEqual(result, mockResponse);
            assert.strictEqual(fetchMock.mock.calls.length, 1);
        });
    });

    describe("list", () => {
        test("should list media with filters successfully", async () => {
            const client = new MediaLit({ apiKey: mockApiKey });
            const mockResponse = [
                {
                    mediaId: "test-id",
                    fileName: "test.jpg",
                    originalFileName: "test.jpg",
                    mimeType: "image/jpeg",
                    size: 1024,
                    thumbnailGenerated: true,
                    accessControl: "public",
                    group: "images",
                },
            ];

            const fetchMock = mock.fn(
                async () =>
                    ({
                        ok: true,
                        json: async () => mockResponse,
                    }) as Response,
            );

            global.fetch = fetchMock;

            const result = await client.list(2, 5, {
                access: "public",
                group: "images",
            });
            assert.deepStrictEqual(result, mockResponse);
            assert.strictEqual(fetchMock.mock.calls.length, 1);

            // The API reads paging and filters from the body.
            const [url, init] = fetchMock.mock.calls[0]
                .arguments as unknown as [string, RequestInit];
            assert.ok(url.endsWith("/media/get"));
            assert.deepStrictEqual(JSON.parse(init.body as string), {
                page: 2,
                limit: 5,
                access: "public",
                group: "images",
            });
        });
    });
});
