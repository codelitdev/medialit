/**
 * Sends one webhook request. The hostname is
 * resolved and every address checked, then the request connects to the
 * checked address itself, with the hostname kept for SNI, certificate
 * checks and the `Host` header. Connecting by name after checking would
 * let the DNS answer change in between (DNS rebinding).
 *
 * Redirects are not followed. Each attempt has one deadline for connecting,
 * TLS, headers and body together. At most 64 KB of the response is read and
 * it is discarded. The result holds only a status code, the duration and a
 * generic error class, never the body or the raw socket error.
 */
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import {
    BlockedAddressError,
    bareHostname,
    parseWebhookUrl,
    resolveAndCheck,
    WebhookUrlError,
    type GuardOptions,
} from "./guard";

export const DELIVERY_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 64 * 1024;

export type DeliveryErrorClass =
    | "timeout"
    | "connection_failed"
    | "tls_error"
    | "blocked_address"
    | "http_status";

export type DeliveryResult =
    | { ok: true; status: number; durationMs: number }
    | {
          ok: false;
          status?: number;
          error: DeliveryErrorClass;
          durationMs: number;
      };

const TLS_ERROR_CODES = new Set([
    "CERT_HAS_EXPIRED",
    "CERT_NOT_YET_VALID",
    "CERT_REVOKED",
    "CERT_UNTRUSTED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "ERR_TLS_HANDSHAKE_TIMEOUT",
    "ERR_SSL_WRONG_VERSION_NUMBER",
    "EPROTO",
    "HOSTNAME_MISMATCH",
]);

function errorClass(error: unknown): DeliveryErrorClass {
    const code = String((error as { code?: unknown })?.code ?? "");
    if (TLS_ERROR_CODES.has(code) || /^ERR_(SSL|TLS)_/.test(code)) {
        return "tls_error";
    }
    return "connection_failed";
}

class DeadlineError extends Error {}

/** How long each address but the last gets to connect, so one that drops
 * packets doesn't use up the whole deadline. */
export const CONNECT_TIMEOUT_MS = 3_000;

const CONNECT_ERROR_CODES = new Set([
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EHOSTDOWN",
    "ENETDOWN",
    "EADDRNOTAVAIL",
    "EAFNOSUPPORT",
    "ETIMEDOUT",
    "ECONNECT_TIMEOUT",
]);

/** True for failures that happen before any of the request is sent: the
 * connection or the TLS handshake failed. */
function beforeSending(error: unknown): boolean {
    const code = String((error as { code?: unknown })?.code ?? "");
    return CONNECT_ERROR_CODES.has(code) || errorClass(error) === "tls_error";
}

export type SendInput = {
    url: string;
    body: string;
    headers: Record<string, string>;
    guard: GuardOptions;
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Extra TLS trust, for tests with a local certificate. */
    ca?: string | Buffer;
};

export async function sendWebhook(input: SendInput): Promise<DeliveryResult> {
    const started = Date.now();
    const timeoutMs = input.timeoutMs ?? DELIVERY_TIMEOUT_MS;
    const elapsed = () => Date.now() - started;
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(new DeadlineError("deadline")),
        timeoutMs,
    );
    const onAbort = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted) onAbort();
    try {
        let url: URL;
        let addresses: { address: string }[];
        try {
            url = parseWebhookUrl(input.url, input.guard);
            addresses = await withAbort(
                resolveAndCheck(url, input.guard),
                controller.signal,
            );
        } catch (error) {
            if (controller.signal.aborted) throw error;
            if (
                error instanceof BlockedAddressError ||
                error instanceof WebhookUrlError
            ) {
                return {
                    ok: false,
                    error: "blocked_address",
                    durationMs: elapsed(),
                };
            }
            return {
                ok: false,
                error: "connection_failed",
                durationMs: elapsed(),
            };
        }
        // Every address was checked; try them in order within the one
        // deadline. Move on only when nothing could have reached a
        // receiver yet (the connection or TLS handshake failed), so an
        // event is never sent twice.
        let status = 0;
        for (let index = 0; ; index++) {
            const last = index === addresses.length - 1;
            try {
                status = await request(
                    url,
                    addresses[index].address,
                    input,
                    controller.signal,
                    last ? undefined : CONNECT_TIMEOUT_MS,
                );
                break;
            } catch (error) {
                if (
                    last ||
                    controller.signal.aborted ||
                    !beforeSending(error)
                ) {
                    throw error;
                }
            }
        }
        const durationMs = elapsed();
        if (status >= 200 && status < 300) {
            return { ok: true, status, durationMs };
        }
        return { ok: false, status, error: "http_status", durationMs };
    } catch (error) {
        const reason = controller.signal.reason;
        if (reason instanceof DeadlineError) {
            return { ok: false, error: "timeout", durationMs: elapsed() };
        }
        if (controller.signal.aborted) {
            // Cancelled by the caller: the job runner handles it.
            throw reason ?? error;
        }
        return { ok: false, error: errorClass(error), durationMs: elapsed() };
    } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", onAbort);
    }
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

/** POSTs to the checked address and returns the status code, after
 * reading at most MAX_RESPONSE_BYTES of the body. */
function request(
    url: URL,
    address: string,
    input: SendInput,
    signal: AbortSignal,
    connectTimeoutMs?: number,
): Promise<number> {
    const secure = url.protocol === "https:";
    const hostname = bareHostname(url);
    const body = Buffer.from(input.body);
    return new Promise<number>((resolve, reject) => {
        const options: https.RequestOptions = {
            // The checked address: no second DNS lookup happens.
            host: address,
            family: isIP(address) === 6 ? 6 : 4,
            port: url.port || (secure ? 443 : 80),
            path: `${url.pathname}${url.search}`,
            method: "POST",
            // A fresh connection, so no pooled socket to another address
            // is reused.
            agent: false,
            headers: {
                ...input.headers,
                host: url.host,
                "content-type": "application/json",
                "content-length": String(body.length),
                "user-agent": "MediaLit-Webhooks/1.0",
            },
            signal,
        };
        if (secure) {
            // SNI and the certificate check use the hostname. SNI can't
            // carry an IP address.
            if (!isIP(hostname)) options.servername = hostname;
            options.checkServerIdentity = (_host, cert) =>
                checkServerIdentity(hostname, cert);
            if (input.ca) options.ca = input.ca;
        }
        const req = (secure ? https : http).request(options, (res) => {
            const status = res.statusCode ?? 0;
            let read = 0;
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve(status);
            };
            res.on("data", (chunk: Buffer) => {
                read += chunk.length;
                if (read >= MAX_RESPONSE_BYTES) {
                    finish();
                    res.destroy();
                    req.destroy();
                }
            });
            res.on("end", finish);
            res.on("close", finish);
            res.on("error", (error) => {
                if (!settled) reject(error);
            });
        });
        if (connectTimeoutMs !== undefined) {
            req.once("socket", (socket) => {
                const timer = setTimeout(
                    () =>
                        req.destroy(
                            Object.assign(new Error("connect timed out"), {
                                code: "ECONNECT_TIMEOUT",
                            }),
                        ),
                    connectTimeoutMs,
                );
                socket.once(secure ? "secureConnect" : "connect", () =>
                    clearTimeout(timer),
                );
                socket.once("close", () => clearTimeout(timer));
            });
        }
        req.on("error", reject);
        req.end(body);
    });
}
