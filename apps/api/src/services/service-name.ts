/**
 * The name this process reports to telemetry. The API and the worker share
 * `services/log.ts`, which builds its telemetry when first imported, so the
 * worker sets its name in a module it imports before anything else
 * (`src/worker-process.ts`).
 */
let current = "medialit-api";

export function setServiceName(name: string): void {
    current = name;
}

export function serviceName(): string {
    return current;
}
