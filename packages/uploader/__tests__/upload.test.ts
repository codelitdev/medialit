import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadFile, MediaLitUploadError, UploadAbortedError } from "../src";
import { DEFAULT_CHUNK_SIZE, shouldRetryUpload } from "../src/upload";

// tus-js-client's Node build reads Buffers, not Blobs.
const fileOf = (text: string) => Buffer.from(text) as unknown as Blob;

const media = {
    mediaId: "m1",
    originalFileName: "hello.txt",
    mimeType: "text/plain",
    size: 5,
    access: "private",
    file: "https://cdn.test/m1",
    thumbnail: "",
};

interface FakeServer {
    endpoint: string;
    requests: { method: string; headers: http.IncomingHttpHeaders }[];
    rejectCreate?: { status: number; body: string };
    /** Answer the next N PATCH requests with this status, storing nothing. */
    failPatches?: { status: number; times: number };
    omitMedia?: boolean;
    close(): Promise<void>;
}

// Speaks the parts of tus that MediaLit's /media/create/resumable route uses.
async function startFakeMediaLit(): Promise<FakeServer> {
    const state: Omit<FakeServer, "endpoint" | "close"> = { requests: [] };
    const uploads = new Map<string, { length: number; offset: number }>();
    let nextId = 1;

    const server = http.createServer((req, res) => {
        state.requests.push({ method: req.method!, headers: req.headers });
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            res.setHeader("Tus-Resumable", "1.0.0");
            if (req.method === "POST") {
                if (state.rejectCreate) {
                    res.writeHead(state.rejectCreate.status);
                    return res.end(state.rejectCreate.body);
                }
                const id = String(nextId++);
                uploads.set(id, {
                    length: Number(req.headers["upload-length"]),
                    offset: 0,
                });
                res.writeHead(201, {
                    Location: `/media/create/resumable/${id}`,
                });
                return res.end();
            }
            const id = req.url!.split("/").pop()!;
            const upload = uploads.get(id);
            if (!upload) {
                res.writeHead(404);
                return res.end();
            }
            if (req.method === "HEAD") {
                res.writeHead(200, {
                    "Upload-Offset": upload.offset,
                    "Upload-Length": upload.length,
                });
                return res.end();
            }
            if (state.failPatches && state.failPatches.times > 0) {
                state.failPatches.times--;
                res.writeHead(state.failPatches.status);
                return res.end();
            }
            upload.offset += Buffer.concat(chunks).length;
            const headers: http.OutgoingHttpHeaders = {
                "Upload-Offset": upload.offset,
            };
            if (upload.offset === upload.length && !state.omitMedia) {
                headers.media = JSON.stringify(media);
            }
            res.writeHead(204, headers);
            res.end();
        });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;

    return Object.assign(state, {
        endpoint: `http://127.0.0.1:${port}`,
        close: () =>
            new Promise<void>((resolve) => server.close(() => resolve())),
    });
}

function decodeMetadata(header: string | string[] | undefined) {
    return Object.fromEntries(
        String(header)
            .split(",")
            .map((pair) => {
                const [key, value = ""] = pair.split(" ");
                return [key, Buffer.from(value, "base64").toString()];
            }),
    );
}

describe("uploadFile", () => {
    let server: FakeServer;
    const signature = () => ({
        getSignature: async () => ({
            signature: "sig-123",
            endpoint: server.endpoint,
        }),
    });

    before(async () => {
        server = await startFakeMediaLit();
    });
    after(() => server.close());
    beforeEach(() => {
        server.requests.length = 0;
        server.rejectCreate = undefined;
        server.omitMedia = false;
    });

    test("uploads with the signature and resolves the media", async () => {
        const progress: number[] = [];
        const result = await uploadFile(fileOf("hello"), {
            ...signature(),
            fileName: "hello.txt",
            access: "public",
            caption: "hi",
            resume: false,
            onProgress: (p) => progress.push(p.percentage),
        });

        assert.deepStrictEqual(result, media);
        const create = server.requests.find((r) => r.method === "POST")!;
        assert.strictEqual(create.headers["x-medialit-signature"], "sig-123");
        assert.deepStrictEqual(
            decodeMetadata(create.headers["upload-metadata"]),
            {
                fileName: "hello.txt",
                mimeType: "application/octet-stream",
                access: "public",
                caption: "hi",
            },
        );
        assert.strictEqual(progress.at(-1), 100);
    });

    test("uploads a Node.js file stream with a MIME type", async () => {
        const dir = await mkdtemp(join(tmpdir(), "medialit-"));
        const path = join(dir, "notes.txt");
        await writeFile(path, "hello");
        try {
            const result = await uploadFile(createReadStream(path), {
                ...signature(),
                fileName: "notes.txt",
                mimeType: "text/plain",
                chunkSize: 2,
                resume: false,
            });
            assert.deepStrictEqual(result, media);
            const create = server.requests.find((r) => r.method === "POST")!;
            assert.strictEqual(
                decodeMetadata(create.headers["upload-metadata"]).mimeType,
                "text/plain",
            );
        } finally {
            await rm(dir, { recursive: true });
        }
    });

    test("sends the file in chunks when chunkSize is set", async () => {
        await uploadFile(fileOf("hello"), {
            ...signature(),
            fileName: "hello.txt",
            chunkSize: 2,
            resume: false,
        });
        const patches = server.requests.filter((r) => r.method === "PATCH");
        assert.strictEqual(patches.length, 3);
    });

    test("sends a big file in default-size chunks", async () => {
        const big = Buffer.alloc(DEFAULT_CHUNK_SIZE + 1024) as unknown as Blob;
        await uploadFile(big, {
            ...signature(),
            fileName: "big.bin",
            resume: false,
        });
        const patches = server.requests.filter((r) => r.method === "PATCH");
        assert.strictEqual(patches.length, 2);
    });

    test("retries a chunk the server timed out (408) and finishes", async () => {
        server.failPatches = { status: 408, times: 1 };
        const result = await uploadFile(fileOf("hello"), {
            ...signature(),
            fileName: "hello.txt",
            retryDelays: [0, 0],
            resume: false,
        });
        assert.deepStrictEqual(result, media);
        const patches = server.requests.filter((r) => r.method === "PATCH");
        assert.strictEqual(patches.length, 2);
    });

    test("does not retry a refused chunk (403)", async () => {
        server.failPatches = { status: 403, times: 1 };
        await assert.rejects(
            uploadFile(fileOf("hello"), {
                ...signature(),
                fileName: "hello.txt",
                retryDelays: [0, 0],
                resume: false,
            }),
            (err: unknown) =>
                err instanceof MediaLitUploadError && err.status === 403,
        );
        const patches = server.requests.filter((r) => r.method === "PATCH");
        assert.strictEqual(patches.length, 1);
    });

    test("rejects with MediaLit's message when it refuses the upload", async () => {
        server.rejectCreate = { status: 403, body: "File size exceeds limit" };
        await assert.rejects(
            uploadFile(fileOf("hello"), {
                ...signature(),
                fileName: "hello.txt",
                retryDelays: [],
                resume: false,
            }),
            (err: unknown) =>
                err instanceof MediaLitUploadError &&
                err.status === 403 &&
                err.message === "File size exceeds limit",
        );
    });

    test("rejects when MediaLit does not return the media", async () => {
        server.omitMedia = true;
        await assert.rejects(
            uploadFile(fileOf("hello"), {
                ...signature(),
                fileName: "hello.txt",
                resume: false,
            }),
            /did not return the media/,
        );
    });

    test("rejects with UploadAbortedError when aborted", async () => {
        const controller = new AbortController();
        const pending = uploadFile(fileOf("hello"), {
            getSignature: async () => {
                controller.abort();
                return { signature: "sig", endpoint: server.endpoint };
            },
            fileName: "hello.txt",
            signal: controller.signal,
        });
        await assert.rejects(pending, UploadAbortedError);
        assert.strictEqual(server.requests.length, 0);
    });

    test("requires a file name for a Blob", async () => {
        await assert.rejects(
            uploadFile(fileOf("hello"), signature()),
            /Pass fileName/,
        );
    });
});

describe("signature endpoint", () => {
    const realFetch = global.fetch;
    after(() => {
        global.fetch = realFetch;
    });

    test("POSTs to the endpoint and surfaces its error", async () => {
        const calls: [string, RequestInit][] = [];
        global.fetch = (async (url: string, init: RequestInit) => {
            calls.push([url, init]);
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
            });
        }) as typeof fetch;

        await assert.rejects(
            uploadFile(fileOf("hello"), {
                signatureEndpoint: "/api/medialit/signature",
                fileName: "hello.txt",
            }),
            (err: unknown) =>
                err instanceof MediaLitUploadError &&
                err.status === 401 &&
                err.message === "Unauthorized",
        );
        assert.strictEqual(calls[0][0], "/api/medialit/signature");
        assert.strictEqual(calls[0][1].method, "POST");
    });

    test("rejects a response without a signature", async () => {
        global.fetch = (async () =>
            new Response(JSON.stringify({ endpoint: "x" }))) as typeof fetch;
        await assert.rejects(
            uploadFile(fileOf("hello"), {
                signatureEndpoint: "/sig",
                fileName: "hello.txt",
            }),
            /must include signature and endpoint/,
        );
    });

    test("requires a way to get a signature", async () => {
        await assert.rejects(
            uploadFile(fileOf("hello"), { fileName: "hello.txt" }),
            /signatureEndpoint or getSignature/,
        );
    });
});

describe("shouldRetryUpload", () => {
    const withStatus = (status: number) => ({
        originalResponse: { getStatus: () => status },
    });

    test("retries network errors, timeouts, rate limits and server errors", () => {
        assert.strictEqual(shouldRetryUpload({}), true);
        for (const status of [408, 409, 423, 429, 500, 502, 503]) {
            assert.strictEqual(shouldRetryUpload(withStatus(status)), true);
        }
    });

    test("does not retry other client errors", () => {
        for (const status of [400, 401, 403, 404, 413]) {
            assert.strictEqual(shouldRetryUpload(withStatus(status)), false);
        }
    });
});
