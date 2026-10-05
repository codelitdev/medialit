import { MediaLit } from "medialit";
import {
    DEFAULT_ENDPOINT,
    loadCredentials,
    normalizeEndpoint,
    saveCredentials,
} from "./credentials";
import { refresh } from "./oauth";

// Refresh a little early so a token doesn't expire mid-command.
const REFRESH_MARGIN_MS = 60 * 1000;

export async function resolveEndpoint(flag?: string): Promise<string> {
    if (flag) return normalizeEndpoint(flag);
    if (process.env.MEDIALIT_ENDPOINT) {
        return normalizeEndpoint(process.env.MEDIALIT_ENDPOINT);
    }
    return (await loadCredentials()).current || DEFAULT_ENDPOINT;
}

/**
 * A client for the given server. `MEDIALIT_API_KEY` wins, for CI; otherwise
 * the login saved by `medialit login`, refreshed when it is about to expire.
 */
export async function getClient(
    endpointFlag?: string,
): Promise<{ client: MediaLit; endpoint: string }> {
    const endpoint = await resolveEndpoint(endpointFlag);
    if (process.env.MEDIALIT_API_KEY) {
        return {
            client: new MediaLit({
                apiKey: process.env.MEDIALIT_API_KEY,
                endpoint,
            }),
            endpoint,
        };
    }

    const credentials = await loadCredentials();
    const server = credentials.servers[endpoint];
    if (!server?.accessToken) {
        throw new Error(
            `Not logged in to ${endpoint}. Run \`medialit login\` first.`,
        );
    }

    if (server.expiresAt && server.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
        if (!server.refreshToken) {
            throw new Error(
                "Your login has expired. Run `medialit login` again.",
            );
        }
        let tokens;
        try {
            tokens = await refresh(server.tokenEndpoint, {
                clientId: server.clientId,
                refreshToken: server.refreshToken,
                resource: server.resource,
            });
        } catch {
            throw new Error(
                "Your login has expired. Run `medialit login` again.",
            );
        }
        server.accessToken = tokens.accessToken;
        server.refreshToken = tokens.refreshToken || server.refreshToken;
        server.expiresAt = tokens.expiresAt;
        server.appId = tokens.appId || server.appId;
        await saveCredentials(credentials);
    }

    return {
        client: new MediaLit({ accessToken: server.accessToken, endpoint }),
        endpoint,
    };
}
