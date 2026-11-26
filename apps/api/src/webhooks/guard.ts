/**
 * Checks a webhook URL before it is saved and again at every delivery.
 * URLs are parsed with the WHATWG parser, so
 * decimal, octal and hex IPv4 spellings (`http://2130706433`,
 * `http://0x7f.1`) are normalized before the address check.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedAddress } from "./address";

export type ResolvedAddress = { address: string; family: 4 | 6 };

/** Resolves a hostname to every address it has. Injected in tests. */
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) => {
    const found = await lookup(hostname, { all: true, verbatim: true });
    return found.map((entry) => ({
        address: entry.address,
        family: entry.family === 6 ? 6 : 4,
    }));
};

export type GuardOptions = {
    /** In production only `https` URLs are accepted. */
    production: boolean;
    /** WEBHOOK_ALLOW_PRIVATE_NETWORKS: skips the address check, for
     * self-hosted installs whose receivers are on their own network. */
    allowPrivateNetworks: boolean;
    resolver: Resolver;
};

export function guardOptionsFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): GuardOptions {
    return {
        production: env.NODE_ENV === "production",
        allowPrivateNetworks: env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === "true",
        resolver: systemResolver,
    };
}

export const MAX_URL_LENGTH = 2048;

export class WebhookUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WebhookUrlError";
    }
}

/** The hostname without IPv6 brackets. */
export function bareHostname(url: URL): string {
    return url.hostname.replace(/^\[|\]$/g, "");
}

/**
 * Parses and checks the scheme and shape of a webhook URL. Returns the
 * normalized URL. Throws `WebhookUrlError` with a message that is safe to
 * show the tenant.
 */
export function parseWebhookUrl(input: unknown, options: GuardOptions): URL {
    if (typeof input !== "string" || input.trim() === "") {
        throw new WebhookUrlError("url is required");
    }
    if (input.length > MAX_URL_LENGTH) {
        throw new WebhookUrlError(
            `url must be at most ${MAX_URL_LENGTH} characters`,
        );
    }
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        throw new WebhookUrlError("url must be an absolute URL");
    }
    // Self-hosted receivers on a private network often have no TLS, so the
    // private-networks setting also allows http in production.
    const httpsOnly = options.production && !options.allowPrivateNetworks;
    if (
        httpsOnly ? url.protocol !== "https:" : !/^https?:$/.test(url.protocol)
    ) {
        throw new WebhookUrlError(
            httpsOnly ? "url must use https" : "url must use http or https",
        );
    }
    if (url.username || url.password) {
        throw new WebhookUrlError("url must not contain credentials");
    }
    if (!url.hostname) {
        throw new WebhookUrlError("url must have a host");
    }
    url.hash = "";
    return url;
}

/**
 * Every address the URL's host resolves to, each checked. Throws
 * `BlockedAddressError` when any of them is refused, and lets DNS errors
 * through. With `allowPrivateNetworks`, nothing is refused.
 */
export async function resolveAndCheck(
    url: URL,
    options: GuardOptions,
): Promise<ResolvedAddress[]> {
    const host = bareHostname(url);
    const literal = isIP(host);
    const addresses: ResolvedAddress[] = literal
        ? [{ address: host, family: literal === 6 ? 6 : 4 }]
        : await options.resolver(host);
    if (addresses.length === 0) {
        throw new Error("hostname has no addresses");
    }
    if (!options.allowPrivateNetworks) {
        for (const { address } of addresses) {
            if (isBlockedAddress(address)) throw new BlockedAddressError();
        }
    }
    return addresses;
}

export class BlockedAddressError extends Error {
    constructor() {
        super("url resolves to an address that is not allowed");
        this.name = "BlockedAddressError";
    }
}

/**
 * The check when an endpoint is saved. A hostname that doesn't resolve yet
 * is accepted, because delivery checks again; one that resolves to a
 * refused address is not.
 */
export async function validateWebhookUrl(
    input: unknown,
    options: GuardOptions,
): Promise<string> {
    const url = parseWebhookUrl(input, options);
    try {
        await resolveAndCheck(url, options);
    } catch (error) {
        if (error instanceof BlockedAddressError) {
            throw new WebhookUrlError(error.message);
        }
        // Not resolvable now; delivery resolves and checks again.
    }
    return url.toString();
}
