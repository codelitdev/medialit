import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { getApikeyUsingKeyId } from "@/app/actions";
import ConnectGuide from "./connect-guide";

function parseHttpUrl(value: string | undefined) {
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

function isLoopback(hostname: string) {
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

function getPublicApiBase(requestHeaders: Headers) {
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

function getPageHostname(requestHeaders: Headers) {
    const requestHost = (
        requestHeaders.get("x-forwarded-host") ||
        requestHeaders.get("host") ||
        ""
    )
        .split(",")[0]
        .trim();

    try {
        return new URL(`http://${requestHost}`).hostname.toLowerCase();
    } catch {
        return "";
    }
}

export default async function ConnectPage(props: {
    params: Promise<{ keyid: string }>;
}) {
    const [{ keyid }, session] = await Promise.all([props.params, auth()]);
    if (!session) redirect("/login");

    const app = await getApikeyUsingKeyId(keyid);
    if (!app) redirect("/");

    const requestHeaders = await headers();
    const apiBase = getPublicApiBase(requestHeaders);
    const includeCliEndpoint =
        getPageHostname(requestHeaders) !== "app.medialit.cloud";

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <h1>Connect</h1>
                    <p>
                        Work with {app.name || "this app"} from an AI assistant
                        or your own code.
                    </p>
                </div>
            </div>
            <ConnectGuide
                appName={app.name || "this app"}
                apiEndpoint={apiBase}
                includeCliEndpoint={includeCliEndpoint}
                serverUrl={`${apiBase}/mcp`}
            />
        </>
    );
}
