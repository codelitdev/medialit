import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Readable } from "node:stream";
import { after, before, beforeEach, describe, test } from "node:test";
import { FILE_IS_REQUIRED, FILE_SIZE_EXCEEDED } from "../config/strings";
import { parseUploadKey } from "./ingest";
import {
    receiveMultipartUpload,
    UploadRejectedError,
    type ReceivedUpload,
} from "./multipart-upload";

const MAX = 1024;

/** A stand-in for the S3 multipart upload: collects the streamed body. */
function fakeStorage() {
    const calls = {
        keys: [] as string[],
        contentTypes: [] as string[],
        bodies: [] as Buffer[],
        aborted: 0,
        discarded: [] as string[],
    };
    const streamTo = (params: {
        Key: string;
        Body: Readable;
        ContentType: string;
    }) => {
        calls.keys.push(params.Key);
        calls.contentTypes.push(params.ContentType);
        const chunks: Buffer[] = [];
        const done = new Promise<any>((resolve, reject) => {
            // What lib-storage does when its body fails: abort the
            // multipart upload, then reject done().
            params.Body.on("error", (err) => {
                calls.aborted++;
                reject(err);
            });
            params.Body.on("data", (chunk: Buffer) => chunks.push(chunk));
            params.Body.on("end", () => {
                calls.bodies.push(Buffer.concat(chunks));
                resolve({});
            });
        });
        return { done: () => done };
    };
    const discard = async (keys: string[]) => {
        calls.discarded.push(...keys);
    };
    return { calls, streamTo, discard };
}

let server: Server;
let baseUrl: string;
let storage: ReturnType<typeof fakeStorage>;
let outcome: Promise<ReceivedUpload | UploadRejectedError>;

before(async () => {
    server = http.createServer((req, res) => {
        outcome = receiveMultipartUpload(req as any, {
            maxFileSize: MAX,
            streamTo: storage.streamTo as any,
            discard: storage.discard,
        }).catch((err) => err);
        outcome.then((result) => {
            if (res.headersSent) return;
            res.statusCode =
                result instanceof UploadRejectedError ? result.status : 200;
            res.end();
        });
    });
    server.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    storage = fakeStorage();
});

function send(form: FormData) {
    return fetch(baseUrl, { method: "POST", body: form }).catch(() => null);
}

describe("receiveMultipartUpload", () => {
    test("streams the file to its final key and keeps fields sent after it", async () => {
        const form = new FormData();
        form.append("caption", "before");
        form.append(
            "file",
            new Blob(["hello world"], { type: "text/plain" }),
            "notes.txt",
        );
        form.append("access", "public");
        await send(form);
        const result = (await outcome) as ReceivedUpload;

        assert.ok(!(result instanceof Error));
        assert.equal(result.originalFileName, "notes.txt");
        assert.equal(result.mimeType, "text/plain");
        assert.equal(result.size, 11);
        assert.equal(result.ext, "txt");
        assert.deepEqual(result.fields, {
            caption: "before",
            access: "public",
        });
        assert.deepEqual(parseUploadKey(result.key), {
            mediaId: result.mediaId,
            ext: "txt",
            key: result.key,
        });
        assert.deepEqual(storage.calls.keys, [result.key]);
        assert.deepEqual(storage.calls.contentTypes, ["text/plain"]);
        assert.equal(storage.calls.bodies[0].toString(), "hello world");
        assert.equal(storage.calls.aborted, 0);
    });

    test("cuts off a file over the limit and stores nothing", async () => {
        const form = new FormData();
        form.append("file", new Blob([Buffer.alloc(MAX * 4)]), "big.bin");
        await send(form);
        const result = await outcome;

        assert.ok(result instanceof UploadRejectedError);
        assert.equal(result.status, 400);
        assert.equal(
            result.message,
            `${FILE_SIZE_EXCEEDED}. Allowed: ${MAX} bytes`,
        );
        assert.equal(storage.calls.aborted, 1);
        assert.deepEqual(storage.calls.discarded, storage.calls.keys);
    });

    test("accepts a file exactly at the limit", async () => {
        const form = new FormData();
        form.append("file", new Blob([Buffer.alloc(MAX)]), "exact.bin");
        await send(form);
        const result = (await outcome) as ReceivedUpload;
        assert.ok(!(result instanceof Error));
        assert.equal(result.size, MAX);
    });

    test("rejects a form without a file", async () => {
        const form = new FormData();
        form.append("caption", "no file");
        await send(form);
        const result = await outcome;

        assert.ok(result instanceof UploadRejectedError);
        assert.equal(result.status, 400);
        assert.equal(result.message, FILE_IS_REQUIRED);
        assert.equal(storage.calls.keys.length, 0);
    });

    test("ignores files sent under another field name", async () => {
        const form = new FormData();
        form.append("other", new Blob(["x"]), "x.txt");
        await send(form);
        const result = await outcome;
        assert.ok(result instanceof UploadRejectedError);
        assert.equal(result.message, FILE_IS_REQUIRED);
        assert.equal(storage.calls.keys.length, 0);
    });

    test("aborts and discards the upload when the client disconnects", async () => {
        const request = http.request(baseUrl, {
            method: "POST",
            headers: { "content-type": "multipart/form-data; boundary=x" },
        });
        request.on("error", () => {});
        request.write(
            '--x\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\npartial',
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        request.destroy();
        const result = await outcome;

        assert.ok(result instanceof UploadRejectedError);
        assert.equal(storage.calls.aborted, 1);
        assert.deepEqual(storage.calls.discarded, storage.calls.keys);
        assert.equal(storage.calls.keys.length, 1);
    });
});

describe("receiveMultipartUpload with the real S3 multipart uploader", () => {
    /** Records the S3 commands lib-storage sends, without a network. */
    function recordingClient() {
        const sent: string[] = [];
        const client = {
            config: {
                requestChecksumCalculation: async () => "WHEN_REQUIRED",
                requestHandler: {},
            },
            middlewareStack: { add() {}, remove() {} },
            send: async (command: any) => {
                const name = command.constructor.name;
                sent.push(name);
                if (name === "CreateMultipartUploadCommand") {
                    return { UploadId: "upload-1" };
                }
                if (name === "UploadPartCommand") {
                    // Read the part body so the stream keeps flowing.
                    return { ETag: `"etag-${sent.length}"` };
                }
                return {};
            },
        };
        return { client, sent };
    }

    test("aborts the S3 multipart upload when a file goes over the limit", async () => {
        const { Upload } = await import("@aws-sdk/lib-storage");
        const { client, sent } = recordingClient();
        const PART = 5 * 1024 * 1024;
        const limit = 7 * 1024 * 1024;

        const realServer = http.createServer((req, res) => {
            outcome = receiveMultipartUpload(req as any, {
                maxFileSize: limit,
                streamTo: (params) =>
                    new Upload({
                        client: client as any,
                        params: { Bucket: "b", ...params },
                        partSize: PART,
                        queueSize: 1,
                        leavePartsOnError: false,
                    }),
                discard: async () => {},
            }).catch((err) => err);
            outcome.then(() => res.end());
        });
        realServer.listen(0);
        await new Promise<void>((r) => realServer.once("listening", r));
        const url = `http://127.0.0.1:${(realServer.address() as AddressInfo).port}`;

        const form = new FormData();
        form.append(
            "file",
            new Blob([Buffer.alloc(20 * 1024 * 1024)]),
            "big.bin",
        );
        await fetch(url, { method: "POST", body: form }).catch(() => null);
        const result = await outcome;
        await new Promise<void>((r) => realServer.close(() => r()));

        assert.ok(result instanceof UploadRejectedError);
        assert.equal(result.status, 400);
        assert.ok(sent.includes("CreateMultipartUploadCommand"), sent.join());
        assert.ok(sent.includes("AbortMultipartUploadCommand"), sent.join());
        assert.ok(
            !sent.includes("CompleteMultipartUploadCommand"),
            sent.join(),
        );
    });
});
