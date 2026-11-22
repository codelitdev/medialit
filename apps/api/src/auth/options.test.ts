import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { sessionCookieName } from "@codelitdev/oauth-server-kit/better-auth";
import { medialitAuthOptions } from "./options";

const secret = "x".repeat(32);
const originalDomain = process.env.AUTH_COOKIE_DOMAIN;

function cookieName(publicApiUrl: string, domain?: string) {
    if (domain === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
    else process.env.AUTH_COOKIE_DOMAIN = domain;
    const options = medialitAuthOptions({ publicApiUrl, secret });
    return sessionCookieName(
        options.advanced as Parameters<typeof sessionCookieName>[0],
    );
}

describe("medialitAuthOptions session cookie", () => {
    afterEach(() => {
        if (originalDomain === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
        else process.env.AUTH_COOKIE_DOMAIN = originalDomain;
    });

    test("keeps the __Secure- name when the dashboard shares it across subdomains", () => {
        // QA and prod: a different name would sign everyone out.
        assert.equal(
            cookieName("https://api.medialit.cloud", "medialit.cloud"),
            "__Secure-medialit.session_token",
        );
    });

    test("uses __Host- on a single https host, and a plain name over http", () => {
        assert.equal(
            cookieName("https://media.example.com"),
            "__Host-medialit.session_token",
        );
        assert.equal(
            cookieName("http://localhost:8000"),
            "medialit.session_token",
        );
    });

    test("turns off the session cookie cache and password sign-in", () => {
        const options = medialitAuthOptions({
            publicApiUrl: "https://api.medialit.cloud",
            secret,
        });
        assert.deepEqual(options.session, { cookieCache: { enabled: false } });
        assert.equal(options.emailAndPassword?.enabled, false);
        assert.deepEqual(options.advanced?.ipAddress, {
            ipAddressHeaders: ["x-medialit-client-ip"],
        });
    });
});
