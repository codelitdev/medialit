import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { configureServerTimeouts } from "./server-timeouts";

/** Sends a body one byte at a time with `gapMs` between bytes. */
function slowPost(port: number, bytes: number, gapMs: number) {
    return new Promise<string>((resolve) => {
        const req = http.request(
            {
                port,
                method: "POST",
                headers: { "content-length": String(bytes) },
            },
            (res) => {
                res.resume();
                res.on("end", () => resolve(String(res.statusCode)));
            },
        );
        req.on("error", (e) => resolve(`error: ${e.message}`));
        (async () => {
            for (let i = 0; i < bytes; i++) {
                await new Promise((r) => setTimeout(r, gapMs));
                req.write("x");
            }
            req.end();
        })();
    });
}

async function serve(configure: (s: http.Server) => void) {
    // Check request timeouts every 100 ms instead of every 30 s.
    const server = http.createServer(
        { connectionsCheckingInterval: 100, requestTimeout: 1000 },
        (req, res) => {
            req.resume();
            req.on("end", () => res.end("ok"));
        },
    );
    configure(server);
    await new Promise<void>((r) => server.listen(0, r));
    return server;
}

test("the default request timeout cuts off a long, steady upload", async () => {
    const server = await serve(() => {});
    const port = (server.address() as AddressInfo).port;
    assert.equal(await slowPost(port, 6, 300), "408");
    server.close();
});

test("a long upload finishes while data keeps flowing", async () => {
    const server = await serve((s) => configureServerTimeouts(s, 1000));
    const port = (server.address() as AddressInfo).port;
    assert.equal(await slowPost(port, 6, 300), "200");
    server.close();
});

test("a stalled upload is still closed", async () => {
    const server = await serve((s) => configureServerTimeouts(s, 500));
    const port = (server.address() as AddressInfo).port;
    assert.match(await slowPost(port, 2, 1500), /^error/);
    server.close();
});
