import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_ENDPOINT = "https://api.medialit.cloud";

/** What the CLI remembers about one MediaLit server. */
export interface ServerCredentials {
    /** From registering the CLI with the server. Kept after logout. */
    clientId: string;
    tokenEndpoint: string;
    revocationEndpoint?: string;
    resource: string;
    accessToken?: string;
    refreshToken?: string;
    /** Milliseconds since the epoch. */
    expiresAt?: number;
    email?: string;
    appId?: string;
}

export interface Credentials {
    /** The server commands use when no endpoint is given. */
    current?: string;
    servers: Record<string, ServerCredentials>;
}

export function normalizeEndpoint(endpoint: string): string {
    return new URL(endpoint).toString().replace(/\/+$/, "");
}

export function configDir(): string {
    if (process.env.MEDIALIT_CONFIG_DIR) return process.env.MEDIALIT_CONFIG_DIR;
    if (process.platform === "win32") {
        return join(
            process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
            "medialit",
        );
    }
    return join(
        process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
        "medialit",
    );
}

const credentialsFile = () => join(configDir(), "credentials.json");

export async function loadCredentials(): Promise<Credentials> {
    try {
        const parsed = JSON.parse(await readFile(credentialsFile(), "utf8"));
        return { servers: {}, ...parsed };
    } catch {
        return { servers: {} };
    }
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
    await mkdir(configDir(), { recursive: true, mode: 0o700 });
    // The file holds tokens, so only the user may read it.
    await writeFile(credentialsFile(), JSON.stringify(credentials, null, 2), {
        mode: 0o600,
    });
    await chmod(credentialsFile(), 0o600);
}
