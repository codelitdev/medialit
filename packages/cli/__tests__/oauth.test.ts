import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { createHash } from "node:crypto";
import http from "node:http";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { authorize, discover, refresh, register } from "../src/oauth";
import { loadCredentials, saveCredentials } from "../src/credentials";
import { getClient } from "../src/session";

const jwt = (claims: object) =>
    `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.x`;

// Speaks the parts of OAuth that MediaLit's server uses for MCP clients.
async function startFakeServer() {
    const state = {
        registrations: [] as any[],
        tokenRequests: [] as URLSearchParams[],
        challenge: "",
        apiAuthorization: "",
    };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, base);
        let body = "";
        for await (const chunk of req) body += chunk;
        const json = (data: object, status = 200) => {
            res.writeHead(status, { "content-type": "application/json" });
            res.end(JSON.stringify(data));
        };

        if (url.pathname === "/.well-known/oauth-protected-resource") {
            return json({
                resource: `${base}/mcp`,
                authorization_servers: [`${base}/api/auth`],
            });
        }
        if (
            url.pathname === "/.well-known/oauth-authorization-server/api/auth"
        ) {
            return json({
                authorization_endpoint: `${base}/api/auth/oauth2/authorize`,
                token_endpoint: `${base}/api/auth/oauth2/token`,
                registration_endpoint: `${base}/api/auth/oauth2/register`,
                revocation_endpoint: `${base}/api/auth/oauth2/revoke`,
                userinfo_endpoint: `${base}/api/auth/oauth2/userinfo`,
            });
        }
        if (url.pathname === "/api/auth/oauth2/register") {
            state.registrations.push(JSON.parse(body));
            return json({ client_id: "client-1" }, 201);
        }
        if (url.pathname === "/api/auth/oauth2/authorize") {
            // Signing in and picking an app happen here in the real server.
            state.challenge = url.searchParams.get("code_challenge")!;
            const redirect = new URL(url.searchParams.get("redirect_uri")!);
            redirect.searchParams.set("code", "code-1");
            redirect.searchParams.set("state", url.searchParams.get("state")!);
            res.writeHead(302, { location: redirect.toString() });
            return res.end();
        }
        if (url.pathname === "/api/auth/oauth2/token") {
            const params = new URLSearchParams(body);
            state.tokenRequests.push(params);
            if (params.get("grant_type") === "authorization_code") {
                const challenge = createHash("sha256")
                    .update(params.get("code_verifier")!)
                    .digest("base64url");
                if (challenge !== state.challenge) {
                    return json({ error: "invalid_grant" }, 400);
                }
            }
            return json({
                access_token: jwt({ app_id: "app-7" }),
                refresh_token: "refresh-2",
                expires_in: 3600,
            });
        }
        if (url.pathname === "/api/auth/oauth2/userinfo") {
            return json({ email: "ada@example.com" });
        }
        if (url.pathname === "/media/get/count") {
            state.apiAuthorization = req.headers.authorization || "";
            return json({ count: 4 });
        }
        res.writeHead(404).end();
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
        ...state,
        get state() {
            return state;
        },
        base,
        close: () => new Promise<void>((r) => server.close(() => r())),
    };
}

describe("login", () => {
    let fake: Awaited<ReturnType<typeof startFakeServer>>;
    let configDir: string;

    before(async () => {
        fake = await startFakeServer();
    });
    after(() => fake.close());
    beforeEach(async () => {
        configDir = await mkdtemp(join(tmpdir(), "medialit-cli-"));
        process.env.MEDIALIT_CONFIG_DIR = configDir;
        delete process.env.MEDIALIT_API_KEY;
        delete process.env.MEDIALIT_ENDPOINT;
    });

    test("discovers, registers and completes the PKCE flow", async () => {
        const metadata = await discover(fake.base);
        assert.strictEqual(metadata.resource, `${fake.base}/mcp`);

        const clientId = await register(metadata);
        assert.strictEqual(clientId, "client-1");
        const registration = fake.state.registrations.at(-1);
        assert.strictEqual(registration.application_type, "native");
        assert.deepStrictEqual(registration.redirect_uris, [
            "http://127.0.0.1/callback",
        ]);

        // Stands in for the browser: follows the redirect to the CLI.
        const tokens = await authorize(metadata, clientId, (url) => {
            fetch(url);
        });
        assert.strictEqual(tokens.email, "ada@example.com");
        assert.strictEqual(tokens.appId, "app-7");
        assert.strictEqual(tokens.refreshToken, "refresh-2");

        const exchange = fake.state.tokenRequests.at(-1)!;
        assert.strictEqual(exchange.get("resource"), `${fake.base}/mcp`);
        assert.match(
            exchange.get("redirect_uri")!,
            /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
        );
    });

    test("rejects a callback with an error", async () => {
        const metadata = await discover(fake.base);
        await assert.rejects(
            authorize(metadata, "client-1", (url) => {
                const redirect = new URL(
                    new URL(url).searchParams.get("redirect_uri")!,
                );
                redirect.searchParams.set("error", "access_denied");
                fetch(redirect);
            }),
            /access_denied/,
        );
    });

    test("refreshes an expiring login before calling the API", async () => {
        await saveCredentials({
            current: fake.base,
            servers: {
                [fake.base]: {
                    clientId: "client-1",
                    tokenEndpoint: `${fake.base}/api/auth/oauth2/token`,
                    resource: `${fake.base}/mcp`,
                    accessToken: "old",
                    refreshToken: "refresh-1",
                    expiresAt: Date.now() + 1000,
                },
            },
        });

        const { client, endpoint } = await getClient();
        assert.strictEqual(endpoint, fake.base);
        assert.strictEqual(await client.getCount(), 4);

        const refreshed = fake.state.tokenRequests.at(-1)!;
        assert.strictEqual(refreshed.get("grant_type"), "refresh_token");
        assert.strictEqual(refreshed.get("refresh_token"), "refresh-1");
        assert.strictEqual(
            fake.state.apiAuthorization,
            `Bearer ${jwt({ app_id: "app-7" })}`,
        );

        const saved = (await loadCredentials()).servers[fake.base];
        assert.strictEqual(saved.refreshToken, "refresh-2");
        if (process.platform !== "win32") {
            const mode = (await stat(join(configDir, "credentials.json"))).mode;
            assert.strictEqual(mode & 0o777, 0o600);
        }
        await rm(configDir, { recursive: true });
    });

    test("uses MEDIALIT_API_KEY without a login", async () => {
        process.env.MEDIALIT_API_KEY = "key-1";
        const { client } = await getClient(fake.base);
        assert.strictEqual(await client.getCount(), 4);
        delete process.env.MEDIALIT_API_KEY;
    });

    test("explains how to log in", async () => {
        await assert.rejects(getClient(fake.base), /medialit login/);
    });

    test("refresh surfaces the server's error", async () => {
        await assert.rejects(
            refresh(`${fake.base}/nope`, {
                clientId: "c",
                refreshToken: "r",
                resource: "x",
            }),
            /404/,
        );
    });
});
