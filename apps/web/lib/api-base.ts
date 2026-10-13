export function parseHttpUrl(value: string | undefined) {
    if (!value) return null;

    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:"
            ? url
            : null;
    } catch {
        return null;
    }
}

export function isLoopback(hostname: string) {
    const normalized = hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, "")
        .replace(/\.$/, "");
    return (
        normalized === "localhost" ||
        normalized.endsWith(".localhost") ||
        normalized === "localtest.me" ||
        normalized.endsWith(".localtest.me") ||
        normalized.endsWith(".test") ||
        normalized === "::1" ||
        normalized === "::" ||
        normalized === "0.0.0.0" ||
        /^127(?:\.\d{1,3}){3}$/.test(normalized)
    );
}

export function getPublicApiBase(requestHeaders: Headers) {
    const configuredPublicUrl = parseHttpUrl(
        process.env.PUBLIC_API_URL?.trim(),
    );
    if (configuredPublicUrl && !isLoopback(configuredPublicUrl.hostname)) {
        return configuredPublicUrl.toString().replace(/\/$/, "");
    }

    const apiServerUrl = parseHttpUrl(process.env.API_SERVER?.trim());
    const apiPort = configuredPublicUrl?.port || apiServerUrl?.port || "8000";
    const requestHost = (
        requestHeaders.get("x-forwarded-host") ||
        requestHeaders.get("host") ||
        ""
    )
        .split(",")[0]
        .trim();
    const forwardedProtocol = requestHeaders
        .get("x-forwarded-proto")
        ?.split(",")[0]
        .trim();
    const protocol = forwardedProtocol === "https" ? "https" : "http";

    if (requestHost) {
        try {
            const incomingUrl = new URL(`${protocol}://${requestHost}`);
            if (!isLoopback(incomingUrl.hostname)) {
                return `${protocol}://${incomingUrl.hostname}:${apiPort}`;
            }
        } catch {
            // Ignore invalid forwarded host values and fall back to configured addresses.
        }
    }

    const fallbackUrl =
        apiServerUrl || configuredPublicUrl || new URL("http://127.0.0.1:8000");
    return fallbackUrl.toString().replace(/\/$/, "");
}

/* Where the MediaLit CLI points when no --endpoint is given. */
const CLI_DEFAULT_ENDPOINT = "https://api.medialit.cloud";

/* The CLI needs --endpoint for any API other than its default. */
export function cliNeedsEndpoint(apiBase: string) {
    return apiBase.replace(/\/$/, "") !== CLI_DEFAULT_ENDPOINT;
}
