import { describe, test, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { MediaLit } from "../src";
import { Media } from "../src/media";
import { Readable } from "stream";

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

            const result = await client.upload("/path/to/test.txt");
            assert.deepStrictEqual(result, mockResponse);
            assert.strictEqual(fetchMock.mock.calls.length, 1);
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

            const fetchMock = mock.fn(async (url: string | URL) => {
                assert.ok(url.toString().includes("access=public"));
                assert.ok(url.toString().includes("group=images"));
                return {
                    ok: true,
                    json: async () => mockResponse,
                } as Response;
            });

            global.fetch = fetchMock;

            const result = await client.list(1, 10, {
                access: "public",
                group: "images",
            });
            assert.deepStrictEqual(result, mockResponse);
            assert.strictEqual(fetchMock.mock.calls.length, 1);
        });
    });

    describe("other methods", () => {
        test("should throw error in browser environment", async () => {
            const client = new MediaLit({ apiKey: mockApiKey });
            mockBrowserGlobals();

            const methods = [
                () => client.delete("test-id"),
                () => client.get("test-id"),
                () => client.list(),
                () => client.getStats(),
                () => client.getSettings(),
                () => client.updateSettings({ useWebP: true }),
            ];

            for (const method of methods) {
                await assert.rejects(
                    method,
                    /MediaLit SDK is only meant to be used in a server-side Node.js environment/,
                );
            }

            cleanupBrowserGlobals();
        });

        // ... existing tests for other methods ...
    });
});
