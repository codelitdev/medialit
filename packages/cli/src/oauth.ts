import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export const SCOPES = "openid email offline_access data:read data:write";
const CALLBACK_PATH = "/callback";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface ServerMetadata {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    revocationEndpoint?: string;
    userinfoEndpoint?: string;
    /** The audience to request tokens for. */
    resource: string;
}

export interface Tokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    email?: string;
    appId?: string;
}

/** Finds the server's OAuth endpoints the same way MCP clients do. */
export async function discover(endpoint: string): Promise<ServerMetadata> {
    const resource = await getJson(
        `${endpoint}/.well-known/oauth-protected-resource`,
    );
    const issuer = resource.authorization_servers?.[0];
    if (!issuer) {
        throw new Error(`${endpoint} does not support logging in with OAuth`);
    }
    // RFC 8414: the issuer's path goes after the well-known segment.
    const issuerUrl = new URL(issuer);
    const path = issuerUrl.pathname === "/" ? "" : issuerUrl.pathname;
    const server = await getJson(
        `${issuerUrl.origin}/.well-known/oauth-authorization-server${path}`,
    );
    return {
        authorizationEndpoint: server.authorization_endpoint,
        tokenEndpoint: server.token_endpoint,
        registrationEndpoint: server.registration_endpoint,
        revocationEndpoint: server.revocation_endpoint,
        userinfoEndpoint: server.userinfo_endpoint,
        resource: resource.resource,
    };
}

/** Registers the CLI as a native app that redirects to a loopback address. */
export async function register(metadata: ServerMetadata): Promise<string> {
    if (!metadata.registrationEndpoint) {
        throw new Error("This server does not let the CLI register itself");
    }
    const response = await fetch(metadata.registrationEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            client_name: "MediaLit CLI",
            application_type: "native",
            // The server accepts any port on a loopback redirect (RFC 8252).
            redirect_uris: [`http://127.0.0.1${CALLBACK_PATH}`],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            scope: SCOPES,
        }),
    });
    const body = await readJson(response);
    if (!response.ok || !body.client_id) {
        throw new Error(
            `Could not register the CLI: ${errorMessage(body, response)}`,
        );
    }
    return body.client_id;
}

/**
 * Runs the authorization code flow with PKCE. The user signs in and picks an
 * app in the browser, which then redirects to a server on this machine.
 */
export async function authorize(
    metadata: ServerMetadata,
    clientId: string,
    openUrl: (url: string) => void,
): Promise<Tokens> {
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(16));

    const callback = await listenForCallback(state);
    const redirectUri = `http://127.0.0.1:${callback.port}${CALLBACK_PATH}`;
    const url = new URL(metadata.authorizationEndpoint);
    url.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: metadata.resource,
    }).toString();

    openUrl(url.toString());
    const code = await callback.code;
    const tokens = await requestTokens(metadata.tokenEndpoint, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource: metadata.resource,
    });
    if (!tokens.email && metadata.userinfoEndpoint) {
        tokens.email = await fetchEmail(
            metadata.userinfoEndpoint,
            tokens.accessToken,
        );
    }
    return tokens;
}

/** Only for showing who is logged in, so failures are ignored. */
async function fetchEmail(
    userinfoEndpoint: string,
    accessToken: string,
): Promise<string | undefined> {
    try {
        const response = await fetch(userinfoEndpoint, {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        const body = await readJson(response);
        return typeof body.email === "string" ? body.email : undefined;
    } catch {
        return undefined;
    }
}

export function refresh(
    tokenEndpoint: string,
    input: { clientId: string; refreshToken: string; resource: string },
): Promise<Tokens> {
    return requestTokens(tokenEndpoint, {
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: input.clientId,
        resource: input.resource,
    });
}

export async function revoke(
    revocationEndpoint: string,
    input: { clientId: string; token: string },
): Promise<void> {
    await fetch(revocationEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            token: input.token,
            token_type_hint: "refresh_token",
            client_id: input.clientId,
        }),
    });
}

async function listenForCallback(state: string) {
    let settle: { resolve(code: string): void; reject(err: Error): void };
    const code = new Promise<string>((resolve, reject) => {
        settle = { resolve, reject };
    });

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (url.pathname !== CALLBACK_PATH) {
            res.writeHead(404).end();
            return;
        }
        const error = url.searchParams.get("error");
        const received = url.searchParams.get("code");
        if (error || !received || url.searchParams.get("state") !== state) {
            respond(res, 400, "Login failed. Return to your terminal.");
            settle.reject(
                new Error(
                    url.searchParams.get("error_description") ||
                        error ||
                        "The login response was not valid",
                ),
            );
            return;
        }
        respond(res, 200, "You're logged in. You can close this tab.");
        settle.resolve(received);
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );

    const timeout = setTimeout(
        () => settle.reject(new Error("Timed out waiting for the login")),
        LOGIN_TIMEOUT_MS,
    );
    code.finally(() => {
        clearTimeout(timeout);
        server.close();
    }).catch(() => undefined);

    return { port: (server.address() as AddressInfo).port, code };
}

function respond(res: http.ServerResponse, status: number, message: string) {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(
        `<!doctype html><title>MediaLit CLI</title>` +
            `<body style="font-family:system-ui;display:grid;place-items:center;height:90vh">` +
            `<p>${message}</p></body>`,
    );
}

async function requestTokens(
    tokenEndpoint: string,
    params: Record<string, string>,
): Promise<Tokens> {
    const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
    });
    const body = await readJson(response);
    if (!response.ok || !body.access_token) {
        throw new Error(errorMessage(body, response));
    }
    return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: body.expires_in
            ? Date.now() + body.expires_in * 1000
            : undefined,
        email: jwtClaim(body.id_token, "email"),
        appId: jwtClaim(body.access_token, "app_id"),
    };
}

/** Reads a claim without verifying the token. Only for display. */
export function jwtClaim(token: unknown, name: string): string | undefined {
    if (typeof token !== "string") return undefined;
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    try {
        const value = JSON.parse(Buffer.from(payload, "base64url").toString())[
            name
        ];
        return typeof value === "string" ? value : undefined;
    } catch {
        return undefined;
    }
}

async function getJson(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} responded with ${response.status}`);
    }
    return response.json();
}

async function readJson(response: Response) {
    return response.json().catch(() => ({}));
}

function errorMessage(body: any, response: Response): string {
    return (
        body?.error_description ||
        body?.error ||
        `the server responded with ${response.status}`
    );
}

function base64url(bytes: Buffer): string {
    return bytes.toString("base64url");
}
