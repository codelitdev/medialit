import type { Server } from "node:http";
import { REQUEST_IDLE_TIMEOUT_MS } from "./config/constants";

/**
 * Lets long uploads run as long as data keeps flowing. Node's (and Bun's)
 * default `requestTimeout` answers 408 to any request still running after
 * five minutes, which cut off big uploads on slow links. Replace it with an
 * inactivity timeout; `headersTimeout` still guards against slow headers.
 */
export function configureServerTimeouts(
    server: Pick<Server, "requestTimeout" | "timeout">,
    idleTimeoutMs = REQUEST_IDLE_TIMEOUT_MS,
): void {
    server.requestTimeout = 0;
    server.timeout = idleTimeoutMs;
}
