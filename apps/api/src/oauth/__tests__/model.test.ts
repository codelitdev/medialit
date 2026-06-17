import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

process.env["OAUTH_SIGNING_KEY"] = crypto.randomBytes(32).toString("hex");

test("registerClient persists DCR clients through OauthClient", async () => {
    const clientModel = (await import("../client-model.js")).default as any;
    const originalCreate = clientModel.create;
    let saved: any;
    clientModel.create = async (client: any) => {
        saved = client;
        return client;
    };

    try {
        const { registerClient } = await import("../model.js");
        const response = await registerClient({
            redirect_uris: ["http://127.0.0.1:33418/"],
            grant_types: ["authorization_code", "refresh_token"],
            token_endpoint_auth_method: "none",
            client_name: "VS Code",
            scope: "read write",
        });

        assert.equal(saved.clientId, response.client_id);
        assert.deepEqual(saved.redirectUris, response.redirect_uris);
        assert.deepEqual(saved.grantTypes, [
            "authorization_code",
            "refresh_token",
        ]);
        assert.equal(saved.tokenEndpointAuthMethod, "none");
        assert.equal(saved.clientName, "VS Code");
        assert.equal(saved.scope, "read write");
        assert.equal(response.client_secret_expires_at, 0);
    } finally {
        clientModel.create = originalCreate;
    }
});

test("registerClient rejects non-loopback http redirect URIs", async () => {
    const clientModel = (await import("../client-model.js")).default as any;
    const originalCreate = clientModel.create;
    let createCalled = false;
    clientModel.create = async () => {
        createCalled = true;
    };

    try {
        const { DcrValidationError, registerClient } = await import(
            "../model.js"
        );

        await assert.rejects(
            registerClient({
                redirect_uris: ["http://example.com/callback"],
            }),
            DcrValidationError,
        );
        assert.equal(createCalled, false);
    } finally {
        clientModel.create = originalCreate;
    }
});

test("registerClient rejects redirect URIs with fragments or credentials", async () => {
    const { DcrValidationError, registerClient } = await import("../model.js");

    await assert.rejects(
        registerClient({
            redirect_uris: ["https://example.com/callback#fragment"],
        }),
        DcrValidationError,
    );

    await assert.rejects(
        registerClient({
            redirect_uris: ["https://user@example.com/callback"],
        }),
        DcrValidationError,
    );
});

test("registerClient rejects unsupported DCR grants", async () => {
    const { DcrValidationError, registerClient } = await import("../model.js");

    await assert.rejects(
        registerClient({
            redirect_uris: ["http://127.0.0.1:33418/"],
            grant_types: ["client_credentials"],
        }),
        DcrValidationError,
    );
});

test("redirectUriMatchesRegistered requires exact redirect URI match", async () => {
    const { redirectUriMatchesRegistered } = await import("../helpers.js");
    const registered = ["https://example.com/callback"];

    assert.equal(
        redirectUriMatchesRegistered(
            "https://example.com/callback",
            registered,
        ),
        true,
    );
    assert.equal(
        redirectUriMatchesRegistered(
            "https://example.com/callback?next=/evil",
            registered,
        ),
        false,
    );
});

test("hashOtp binds OTP hashes to the pending session", async () => {
    const { hashOtp } = await import("../helpers.js");

    assert.equal(
        hashOtp("pending-1", "123456"),
        hashOtp("pending-1", "123456"),
    );
    assert.notEqual(
        hashOtp("pending-1", "123456"),
        hashOtp("pending-2", "123456"),
    );
});

test("oauthModel.getClient resolves DCR clients from OauthClient", async () => {
    const clientModel = (await import("../client-model.js")).default as any;
    const originalFindOne = clientModel.findOne;
    clientModel.findOne = () => ({
        lean: async () => ({
            clientId: "client-1",
            redirectUris: ["http://127.0.0.1:33418/"],
            grantTypes: ["authorization_code", "refresh_token"],
        }),
    });

    try {
        const { oauthModel } = await import("../model.js");
        const client = (await oauthModel.getClient("client-1", "")) as any;

        assert.equal(client?.id, "client-1");
        assert.deepEqual(client?.redirectUris, ["http://127.0.0.1:33418/"]);
        assert.deepEqual(client?.grants, [
            "authorization_code",
            "refresh_token",
        ]);
    } finally {
        clientModel.findOne = originalFindOne;
    }
});

test("oauthModel.saveToken uses expiry dates supplied by oauth2-server", async () => {
    const { oauthModel } = await import("../model.js");
    const accessTokenExpiresAt = new Date("2030-01-01T00:00:00.000Z");
    const refreshTokenExpiresAt = new Date("2030-02-01T00:00:00.000Z");

    const savedToken = (await oauthModel.saveToken(
        {
            accessTokenExpiresAt,
            refreshTokenExpiresAt,
            scope: ["read"],
        } as any,
        { id: "client-1" } as any,
        { id: "user-1" } as any,
    )) as any;

    assert.equal(savedToken.accessTokenExpiresAt, accessTokenExpiresAt);
    assert.equal(savedToken.refreshTokenExpiresAt, refreshTokenExpiresAt);
});

test("oauthModel.getRefreshToken rejects persisted revoked refresh tokens", async () => {
    const revokedTokenModel = (await import("../revoked-token-model.js"))
        .default as any;
    const originalFindOne = revokedTokenModel.findOne;
    revokedTokenModel.findOne = () => ({
        lean: async () => ({ jti: "revoked-jti" }),
    });

    try {
        const { oauthModel } = await import("../model.js");
        const savedToken = (await oauthModel.saveToken(
            { scope: ["read"] } as any,
            { id: "client-1" } as any,
            { id: "user-1" } as any,
        )) as any;

        const refreshToken = await oauthModel.getRefreshToken(
            savedToken.refreshToken,
        );

        assert.equal(refreshToken, null);
    } finally {
        revokedTokenModel.findOne = originalFindOne;
    }
});

test("oauthModel.revokeToken persists refresh token jti with expiry", async () => {
    const revokedTokenModel = (await import("../revoked-token-model.js"))
        .default as any;
    const originalFindOne = revokedTokenModel.findOne;
    const originalUpdateOne = revokedTokenModel.updateOne;
    let update: any;
    revokedTokenModel.findOne = () => ({
        lean: async () => null,
    });
    revokedTokenModel.updateOne = async (
        filter: any,
        payload: any,
        options: any,
    ) => {
        update = { filter, payload, options };
        return { acknowledged: true, upsertedCount: 1 };
    };

    try {
        const { oauthModel } = await import("../model.js");
        const savedToken = (await oauthModel.saveToken(
            { scope: ["read"] } as any,
            { id: "client-1" } as any,
            { id: "user-1" } as any,
        )) as any;
        const refreshToken = await oauthModel.getRefreshToken(
            savedToken.refreshToken,
        );

        assert.ok(refreshToken);
        await oauthModel.revokeToken(refreshToken);

        assert.equal(update.filter.jti, update.payload.$setOnInsert.jti);
        assert.equal(update.payload.$setOnInsert.tokenType, "refresh_token");
        assert.equal(update.payload.$setOnInsert.userId, "user-1");
        assert.equal(update.payload.$setOnInsert.clientId, "client-1");
        assert.ok(update.payload.$setOnInsert.expiresAt instanceof Date);
        assert.deepEqual(update.options, { upsert: true });
    } finally {
        revokedTokenModel.findOne = originalFindOne;
        revokedTokenModel.updateOne = originalUpdateOne;
    }
});
