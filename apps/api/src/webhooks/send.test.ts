import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { GuardOptions, Resolver } from "./guard";
import { MAX_RESPONSE_BYTES, sendWebhook } from "./send";
import { REFUSED_ADDRESSES } from "./test-fixtures";

type Seen = { host?: string; path?: string; sni?: string };

function listen(
    server: http.Server | https.Server,
): Promise<{ port: number; close: () => Promise<void> }> {
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve({
                port: (server.address() as AddressInfo).port,
                close: () =>
                    new Promise((done) => {
                        server.closeAllConnections?.();
                        server.close(() => done());
                    }),
            });
        });
    });
}

const toLocalhost: Resolver = async () => [{ address: "127.0.0.1", family: 4 }];

function guard(
    resolver: Resolver,
    overrides: Partial<GuardOptions> = {},
): GuardOptions {
    return {
        production: false,
        allowPrivateNetworks: true,
        resolver,
        ...overrides,
    };
}

const post = (
    url: string,
    options: Partial<Parameters<typeof sendWebhook>[0]> = {},
) =>
    sendWebhook({
        url,
        body: '{"type":"webhook.test"}',
        headers: { "webhook-id": "msg_test" },
        guard: guard(toLocalhost),
        ...options,
    });

describe("sending a webhook", () => {
    const seen: Seen[] = [];
    let behavior: (req: http.IncomingMessage, res: http.ServerResponse) => void;
    let server: { port: number; close: () => Promise<void> };
    let target: { port: number; close: () => Promise<void> };
    let targetHits = 0;

    before(async () => {
        server = await listen(
            http.createServer((req, res) => {
                seen.push({ host: req.headers.host, path: req.url });
                behavior(req, res);
            }),
        );
        target = await listen(
            http.createServer((_req, res) => {
                targetHits++;
                res.writeHead(200).end();
            }),
        );
    });

    after(async () => {
        await server.close();
        await target.close();
    });

    test("connects to the checked address and keeps the hostname in Host", async () => {
        behavior = (_req, res) => res.writeHead(204).end();
        seen.length = 0;
        const result = await post(
            `http://receiver.test:${server.port}/hook?x=1`,
        );
        assert.equal(result.ok, true);
        assert.equal(result.ok && result.status, 204);
        assert.deepEqual(seen, [
            { host: `receiver.test:${server.port}`, path: "/hook?x=1" },
        ]);
    });

    test("a 3xx fails and the redirect is not followed, even to a private address", async () => {
        behavior = (_req, res) =>
            res
                .writeHead(302, {
                    location: `http://127.0.0.1:${target.port}/internal`,
                })
                .end();
        const result = await post(`http://receiver.test:${server.port}/hook`);
        assert.deepEqual(
            { ...result, durationMs: 0 },
            { ok: false, status: 302, error: "http_status", durationMs: 0 },
        );
        assert.equal(targetHits, 0);
    });

    test("an answer that never comes times out within the deadline", async () => {
        behavior = () => undefined;
        const started = Date.now();
        const result = await post(`http://receiver.test:${server.port}/hook`, {
            timeoutMs: 300,
        });
        assert.equal(result.ok, false);
        assert.equal(!result.ok && result.error, "timeout");
        assert.ok(Date.now() - started < 2_000);
    });

    test("a body that never ends counts against the same deadline", async () => {
        behavior = (_req, res) => {
            res.writeHead(200);
            res.write("x");
        };
        const result = await post(`http://receiver.test:${server.port}/hook`, {
            timeoutMs: 300,
        });
        assert.equal(!result.ok && result.error, "timeout");
    });

    test("reads at most 64 KB of the response, then stops", async () => {
        // The body never ends: only stopping at the cap finishes in time.
        behavior = (_req, res) => {
            res.writeHead(200);
            const chunk = Buffer.alloc(16 * 1024, 97);
            const pump = () => {
                while (!res.destroyed && res.write(chunk));
                if (!res.destroyed) res.once("drain", pump);
            };
            res.on("error", () => undefined);
            pump();
        };
        const started = Date.now();
        const result = await post(`http://receiver.test:${server.port}/hook`, {
            timeoutMs: 5_000,
        });
        assert.equal(result.ok, true);
        assert.ok(Date.now() - started < 2_000);
        assert.ok(MAX_RESPONSE_BYTES === 64 * 1024);
    });

    test("a closed port fails with connection_failed and no socket detail", async () => {
        const closed = await listen(http.createServer());
        await closed.close();
        const result = await post(`http://receiver.test:${closed.port}/hook`);
        assert.deepEqual(Object.keys(result).sort(), [
            "durationMs",
            "error",
            "ok",
        ]);
        assert.equal(!result.ok && result.error, "connection_failed");
    });

    test("a hostname whose answer changed to a private address is refused at delivery", async () => {
        for (const address of REFUSED_ADDRESSES) {
            seen.length = 0;
            const result = await post(
                `http://receiver.test:${server.port}/hook`,
                {
                    guard: guard(
                        async () => [
                            { address, family: address.includes(":") ? 6 : 4 },
                        ],
                        { allowPrivateNetworks: false },
                    ),
                },
            );
            assert.equal(
                !result.ok && result.error,
                "blocked_address",
                address,
            );
            assert.equal(seen.length, 0, address);
        }
    });

    test("refused literal URLs are refused at delivery unless private networks are allowed", async () => {
        const strict = guard(toLocalhost, { allowPrivateNetworks: false });
        for (const host of [
            "127.0.0.1",
            "2130706433",
            "0x7f.1",
            "[::ffff:127.0.0.1]",
        ]) {
            seen.length = 0;
            const url = `http://${host}:${server.port}/hook`;
            const refused = await post(url, { guard: strict });
            assert.equal(!refused.ok && refused.error, "blocked_address", host);
            assert.equal(seen.length, 0);
        }
        behavior = (_req, res) => res.writeHead(200).end();
        const allowed = await post(`http://2130706433:${server.port}/hook`);
        assert.equal(allowed.ok, true);
    });

    test("an unresolvable hostname fails with connection_failed", async () => {
        const result = await post("http://nowhere.test/hook", {
            guard: guard(async () => {
                throw Object.assign(new Error("ENOTFOUND nowhere.test"), {
                    code: "ENOTFOUND",
                });
            }),
        });
        assert.equal(!result.ok && result.error, "connection_failed");
    });
});

let openssl = true;
try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
} catch {
    openssl = false;
}

describe(
    "sending a webhook over TLS",
    { skip: openssl ? false : "needs openssl to make a certificate" },
    () => {
        let dir: string;
        let cert: Buffer;
        let server: { port: number; close: () => Promise<void> };
        const seen: Seen[] = [];

        before(async () => {
            dir = mkdtempSync(join(tmpdir(), "medialit-webhook-tls-"));
            execFileSync(
                "openssl",
                [
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-keyout",
                    join(dir, "key.pem"),
                    "-out",
                    join(dir, "cert.pem"),
                    "-days",
                    "1",
                    "-subj",
                    "/CN=receiver.test",
                    "-addext",
                    "subjectAltName=DNS:receiver.test",
                ],
                { stdio: "ignore" },
            );
            cert = readFileSync(join(dir, "cert.pem"));
            server = await listen(
                https.createServer(
                    { cert, key: readFileSync(join(dir, "key.pem")) },
                    (req, res) => {
                        seen.push({
                            host: req.headers.host,
                            sni: (req.socket as { servername?: string })
                                .servername,
                        });
                        res.writeHead(200).end();
                    },
                ),
            );
        });

        after(async () => {
            await server?.close();
            rmSync(dir, { recursive: true, force: true });
        });

        test("SNI and the certificate check use the hostname, not the address", async () => {
            const result = await post(
                `https://receiver.test:${server.port}/hook`,
                { ca: cert },
            );
            assert.equal(result.ok, true);
            assert.deepEqual(seen, [
                { host: `receiver.test:${server.port}`, sni: "receiver.test" },
            ]);
        });

        test("a certificate for another name fails with tls_error", async () => {
            const result = await post(
                `https://other.test:${server.port}/hook`,
                { ca: cert },
            );
            assert.equal(!result.ok && result.error, "tls_error");
        });

        test("an untrusted certificate fails with tls_error", async () => {
            const result = await post(
                `https://receiver.test:${server.port}/hook`,
            );
            assert.equal(!result.ok && result.error, "tls_error");
        });
    },
);
