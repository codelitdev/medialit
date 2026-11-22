/**
 * Telemetry for the API and the worker (pipelines-phase-0.md, section 9),
 * set up as in SendLit. Logs always go to stdout. With POSTHOG_API_KEY set,
 * every log line is also sent to PostHog's logs endpoint, and errors and
 * events are captured. Without it, capture calls do nothing.
 */
import {
    createObservability,
    type CaptureClient,
    type CaptureEventInput,
    type Observability,
} from "@codelitdev/observability";
import { serviceName } from "./service-name";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_LOGS_PATH = "/i/v1/logs";

/** Properties allowed on captured errors and events. Anything else is dropped. */
const PROPERTY_ALLOWLIST = new Set([
    "status",
    "path",
    "method",
    "code",
    "media_id",
    "job_id",
    "app_id",
    "job_type",
    "job_class",
    "attempts_made",
    "failed_reason",
    "duration_ms",
    "wait_ms",
    "worker_id",
    "alert_code",
    "age_ms",
    "count",
    "reason",
    // Product events and lifecycle logs (pipelines-phase-1.md, 7.7).
    "transport",
    "media_kind",
    "access",
    "size_bytes",
    "thumbnail",
    "webp",
    "jobs_queued",
    "derivative",
    "derivatives",
    "failed_derivatives",
    "endpoint_id",
    "event_type",
    "response_code",
    "error_class",
    "action",
    "changed",
    "use_webp",
    "temp",
    "next_run_in_ms",
]);

/** Allowlisted keys that hold record IDs. They skip the long-token mask,
 * which would otherwise hide every 40-character ID. */
const IDENTIFIER_KEYS = new Set([
    "media_id",
    "job_id",
    "app_id",
    "endpoint_id",
]);

/**
 * `purpose: "events"` builds the instance for product events. Errors are
 * deduplicated and capped per source, which would drop repeated events, so
 * that instance turns both off and sends no logs.
 */
export function createMedialitObservability(
    env: NodeJS.ProcessEnv = process.env,
    options: {
        client?: CaptureClient;
        purpose?: "errors" | "events";
        service?: string;
    } = {},
): Observability {
    const forEvents = options.purpose === "events";
    const apiKey = (env.POSTHOG_API_KEY || env.POSTHOG_ID)?.trim();
    const host = (env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST)
        .trim()
        .replace(/\/+$/, "");
    return createObservability({
        serviceName: options.service ?? serviceName(),
        environment: env.NODE_ENV || "development",
        ...(apiKey
            ? { posthog: { apiKey, host, client: options.client } }
            : {}),
        logs: {
            level: env.LOG_LEVEL || "info",
            ...(apiKey && !forEvents
                ? {
                      otlp: {
                          endpoint: `${host}${POSTHOG_LOGS_PATH}`,
                          headers: { Authorization: `Bearer ${apiKey}` },
                      },
                  }
                : {}),
        },
        contextPolicy: {
            propertyAllowlist: PROPERTY_ALLOWLIST,
            identifierKeys: IDENTIFIER_KEYS,
        },
        ...(forEvents
            ? {
                  dedupeTtlMs: 0,
                  dedupeMaxKeys: 1,
                  perSourceCap: Number.POSITIVE_INFINITY,
              }
            : {}),
    });
}

const observability = createMedialitObservability();
const productEvents = createMedialitObservability(process.env, {
    purpose: "events",
});

export const captureException =
    observability.captureException.bind(observability);
export const captureEvent: (input: CaptureEventInput) => void =
    productEvents.captureEvent.bind(productEvents);

/** Flushes captured errors, events and sent logs, within `timeoutMs`. */
export const shutdownObservability = async (timeoutMs: number) => {
    await Promise.all([
        observability.shutdown(timeoutMs),
        productEvents.shutdown(timeoutMs),
    ]);
};

export default observability.logger;
