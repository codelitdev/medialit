import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Webhook } from "standardwebhooks";
import { isBlockedAddress, ipv6Bytes } from "./address";
import {
    parseWebhookUrl,
    validateWebhookUrl,
    WebhookUrlError,
    type GuardOptions,
    type Resolver,
} from "./guard";
import { generateSecret, sign, signedHeaders } from "./signing";
import { webhookRetryDelayMs } from "./delivery";
import { REFUSED_ADDRESSES } from "./test-fixtures";

const ALLOWED_ADDRESSES = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.215.14",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "169.253.0.1",
    "::ffff:8.8.8.8",
    "2606:4700:4700::1111",
    "2a00:1450:4001::200e",
    "2002:808:808::1",
];

function guard(
    resolver: Resolver,
    overrides: Partial<GuardOptions> = {},
): GuardOptions {
    return {
        production: false,
        allowPrivateNetworks: false,
        resolver,
        ...overrides,
    };
}

const resolveTo =
    (address: string): Resolver =>
    async () => [{ address, family: address.includes(":") ? 6 : 4 }];

const unresolvable: Resolver = async () => {
    throw Object.assign(new Error("getaddrinfo ENOTFOUND"), {
        code: "ENOTFOUND",
    });
};

describe("webhook address guard", () => {
    test("every refused range is refused", () => {
        for (const address of REFUSED_ADDRESSES) {
            assert.equal(isBlockedAddress(address), true, address);
        }
    });

    test("public addresses are allowed", () => {
        for (const address of ALLOWED_ADDRESSES) {
            assert.equal(isBlockedAddress(address), false, address);
        }
    });

    test("anything that isn't an IP address is refused", () => {
        for (const value of ["", "localhost", "1.2.3", "::g", "1.2.3.4.5"]) {
            assert.equal(isBlockedAddress(value), true, value);
        }
    });

    test("IPv6 parsing expands every form", () => {
        assert.deepEqual(
            ipv6Bytes("::ffff:127.0.0.1"),
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 127, 0, 0, 1],
        );
        assert.deepEqual(
            ipv6Bytes("::ffff:127.0.0.1"),
            ipv6Bytes("::ffff:7f00:1"),
        );
        assert.deepEqual(ipv6Bytes("[::1]"), ipv6Bytes("0:0:0:0:0:0:0:1"));
        assert.equal(ipv6Bytes("1.2.3.4"), null);
    });

    test("URLs are normalized before the check: decimal, octal, hex and mapped forms", async () => {
        const options = guard(unresolvable);
        for (const url of [
            "http://2130706433/hook",
            "http://0x7f.1/hook",
            "http://0177.0.0.1/hook",
            "http://127.1/hook",
            "http://0/hook",
            "http://[::ffff:127.0.0.1]/hook",
            "http://[::ffff:7f00:1]/hook",
            "http://169.254.169.254/latest/meta-data",
            "http://[::]/hook",
            "http://[fe80::1]/hook",
            "http://0xa9.0xfe.0xa9.0xfe/hook",
            "http://2852039166/hook",
        ]) {
            await assert.rejects(
                validateWebhookUrl(url, options),
                WebhookUrlError,
                url,
            );
        }
    });

    test("a hostname that resolves to any refused address is refused at save", async () => {
        for (const address of REFUSED_ADDRESSES) {
            await assert.rejects(
                validateWebhookUrl(
                    "https://hooks.example.test/x",
                    guard(resolveTo(address)),
                ),
                /not allowed/,
                address,
            );
        }
        // One bad address among good ones is enough.
        await assert.rejects(
            validateWebhookUrl(
                "https://hooks.example.test/x",
                guard(async () => [
                    { address: "8.8.8.8", family: 4 },
                    { address: "10.1.2.3", family: 4 },
                ]),
            ),
            /not allowed/,
        );
    });

    test("WEBHOOK_ALLOW_PRIVATE_NETWORKS turns the address check off", async () => {
        for (const address of REFUSED_ADDRESSES) {
            assert.equal(
                await validateWebhookUrl(
                    "http://hooks.internal.test/x",
                    guard(resolveTo(address), { allowPrivateNetworks: true }),
                ),
                "http://hooks.internal.test/x",
            );
        }
        assert.equal(
            await validateWebhookUrl(
                "http://2130706433/x",
                guard(unresolvable, { allowPrivateNetworks: true }),
            ),
            "http://127.0.0.1/x",
        );
    });

    test("production accepts https only, unless private networks are allowed", async () => {
        const production = guard(resolveTo("8.8.8.8"), { production: true });
        assert.throws(
            () => parseWebhookUrl("http://hooks.example.com/x", production),
            /https/,
        );
        assert.equal(
            await validateWebhookUrl("https://hooks.example.com/x", production),
            "https://hooks.example.com/x",
        );
        assert.equal(
            parseWebhookUrl("http://hooks.example.com/x", {
                ...production,
                allowPrivateNetworks: true,
            }).protocol,
            "http:",
        );
    });

    test("other schemes, credentials and junk are refused", () => {
        const options = guard(unresolvable);
        for (const url of [
            "ftp://example.com/x",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://user:pass@example.com/x",
            "example.com/x",
            "",
            `https://example.com/${"a".repeat(3000)}`,
        ]) {
            assert.throws(
                () => parseWebhookUrl(url, options),
                WebhookUrlError,
                url,
            );
        }
        assert.throws(() => parseWebhookUrl(42, options), WebhookUrlError);
    });

    test("a hostname that doesn't resolve yet is accepted at save", async () => {
        assert.equal(
            await validateWebhookUrl(
                "https://not-yet.example.test/hook#frag",
                guard(unresolvable),
            ),
            "https://not-yet.example.test/hook",
        );
    });
});

describe("webhook signing", () => {
    test("signatures verify with the Standard Webhooks library", () => {
        const secret = generateSecret();
        assert.match(secret, /^whsec_[A-Za-z0-9+/]{32}$/);
        const body = JSON.stringify({ type: "media.processing.ready" });
        const headers = signedHeaders({ secret, id: "msg_1", body });
        assert.match(headers["webhook-signature"], /^v1,[A-Za-z0-9+/]+=*$/);
        assert.deepEqual(new Webhook(secret).verify(body, headers), {
            type: "media.processing.ready",
        });
        assert.throws(() =>
            new Webhook(generateSecret()).verify(body, headers),
        );
        assert.throws(() => new Webhook(secret).verify(`${body} `, headers));
    });

    test("matches the spec's published test vector", () => {
        // From github.com/standard-webhooks/standard-webhooks (spec tests).
        assert.equal(
            sign({
                secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
                id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
                timestamp: 1614265330,
                body: '{"test": 2432232314}',
            }),
            "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
        );
    });
});

describe("webhook retries", () => {
    test("eight attempts span about a day", () => {
        let total = 0;
        for (let attempt = 1; attempt < 8; attempt++) {
            total += webhookRetryDelayMs(attempt, () => 0.5);
        }
        const hours = total / 3_600_000;
        assert.ok(hours > 22 && hours < 26, `${hours} hours`);
        assert.ok(webhookRetryDelayMs(1, () => 0) >= 27_000);
        assert.ok(webhookRetryDelayMs(1, () => 1) <= 33_000);
    });
});
