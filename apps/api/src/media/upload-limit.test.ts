import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import express from "express";
import { TOO_MANY_UPLOADS } from "../config/strings";
import { limitConcurrentUploads } from "./upload-guards";

let server: Server;
let port: number;
const limiter = limitConcurrentUploads(2);

before(async () => {
    const app = express();
    // Reads the body slowly, the way a streaming upload holds its slot.
    app.post("/upload", limiter, (req, res) => {
        req.resume();
        req.on("end", () => res.json({ ok: true }));
    });
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
});

after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
});

/** Starts an upload that stays open until finish() is called. */
function openUpload() {
    const req = http.request({
        port,
        path: "/upload",
        method: "POST",
        headers: { "content-length": "10" },
    });
    const status = new Promise<number>((resolve) => {
        req.on("response", (res) => {
            res.resume();
            resolve(res.statusCode!);
        });
        req.on("error", () => resolve(-1));
    });
    req.write("12345");
    return {
        status: () => status,
        finish: () => req.end("67890"),
        drop: () => req.destroy(),
    };
}

async function post(): Promise<{ status: number; body: any; retry: string }> {
    const res = await fetch(`http://127.0.0.1:${port}/upload`, {
        method: "POST",
        body: "x",
    });
    return {
        status: res.status,
        body: await res.json(),
        retry: res.headers.get("retry-after") ?? "",
    };
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("limitConcurrentUploads", () => {
    test("answers 503 with Retry-After once the cap is reached", async () => {
        const a = openUpload();
        const b = openUpload();
        await settle();
        assert.equal(limiter.activeCount(), 2);

        const over = await post();
        assert.equal(over.status, 503);
        assert.equal(over.body.error, TOO_MANY_UPLOADS);
        assert.equal(over.retry, "10");

        a.finish();
        assert.equal(await a.status(), 200);
        await settle();
        assert.equal((await post()).status, 200);

        b.finish();
        await b.status();
        await settle();
        assert.equal(limiter.activeCount(), 0);
    });

    test("frees the slot when a client disconnects", async () => {
        const a = openUpload();
        const b = openUpload();
        await settle();
        assert.equal(limiter.activeCount(), 2);
        a.drop();
        b.drop();
        await settle();
        assert.equal(limiter.activeCount(), 0);
        assert.equal((await post()).status, 200);
    });
});
