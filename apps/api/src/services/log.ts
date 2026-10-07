import { createObservability } from "@codelitdev/observability";

const posthogKey = process.env.POSTHOG_API_KEY || process.env.POSTHOG_ID;

const observability = createObservability({
    serviceName: "medialit-api",
    environment: process.env.NODE_ENV || "development",
    ...(posthogKey
        ? {
              posthog: {
                  apiKey: posthogKey,
                  host: process.env.POSTHOG_HOST,
              },
          }
        : {}),
    logs: { level: process.env.LOG_LEVEL || "info" },
    contextPolicy: {
        propertyAllowlist: new Set([
            "mediaId",
            "status",
            "path",
            "method",
            "code",
        ]),
    },
});

export const captureException =
    observability.captureException.bind(observability);
export const shutdownObservability = (timeoutMs: number) =>
    observability.shutdown(timeoutMs);
export default observability.logger;
