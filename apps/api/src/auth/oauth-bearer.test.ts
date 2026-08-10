import assert from "node:assert/strict";
import test from "node:test";
import { authIssuer, validOAuthAudiences } from "./better-auth";
import { validateOAuthBearer } from "./oauth-bearer";

test("validates a Better Auth bearer against this issuer and accepted audiences", async () => {
    let verifiedToken = "";
    let verificationOptions: unknown;
    const identity = await validateOAuthBearer(
        "issued-access-token",
        async (token, options) => {
            verifiedToken = token;
            verificationOptions = options;
            return {
                sub: "user-1",
                azp: "client-1",
                aud: validOAuthAudiences[0],
                scope: "openid media:read media:write",
            };
        },
    );

    assert.equal(verifiedToken, "issued-access-token");
    assert.deepEqual(verificationOptions, {
        verifyOptions: {
            issuer: authIssuer,
            audience: validOAuthAudiences,
        },
    });
    assert.deepEqual(identity, {
        userId: "user-1",
        clientId: "client-1",
        scopes: ["openid", "media:read", "media:write"],
    });
});

test("rejects bearer tokens without a valid subject, client, or audience", async () => {
    for (const claims of [
        { azp: "client-1", aud: validOAuthAudiences[0] },
        { sub: "user-1", aud: validOAuthAudiences[0] },
        { sub: "user-1", azp: "client-1", aud: "https://other.example" },
    ]) {
        const identity = await validateOAuthBearer(
            "invalid-claims",
            async () => claims,
        );
        assert.equal(identity, null);
    }
});
