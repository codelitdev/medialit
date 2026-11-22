/**
 * Product events (pipelines-phase-1.md, 7.2 and 7.3), sent through
 * `@codelitdev/observability` like SendLit's `observability/index.ts`.
 *
 * - The subject is the account: the user ID the dashboard identifies with,
 *   so server and browser events land on the same person.
 * - `groups: { app }` holds the app's public ID, which is what the dashboard
 *   has in its URLs. `app_id` in the properties is the internal ID, as in
 *   logs and exceptions.
 * - Every occurrence counts (`dedupe: false`).
 * - Properties are IDs, enums, counts, sizes and durations only. Never file
 *   names, captions, groups, URLs, hosts, secrets or tokens. The allowlist in
 *   `log.ts` drops anything else.
 *
 * Sending never throws and never delays the caller: the app lookup runs in
 * the background, and failures are logged at debug.
 */
import type { CaptureEventInput } from "@codelitdev/observability";
import { getAppById } from "@/db";
import logger, { captureEvent } from "./log";

export type ProductEvent =
    | "media.uploaded"
    | "media.sealed"
    | "media.processing.settled"
    | "media.deleted"
    | "webhook.delivered"
    | "webhook.delivery_failed"
    | "webhook.endpoint_changed"
    | "media_settings.updated";

/** Work that belongs to no account reports as `system`, as exceptions do. */
export const SYSTEM_SUBJECT = "system";

type AppOwner = { userId: string; publicAppId: string };

/** App IDs and owners never change, so lookups are cached. Bounded so a
 * long-running process can't grow it without limit. */
const MAX_CACHED_APPS = 1000;
const appCache = new Map<string, AppOwner>();

async function appOwner(appId: string): Promise<AppOwner | null> {
    const cached = appCache.get(appId);
    if (cached) return cached;
    const app = await getAppById(appId);
    if (!app) return null;
    const owner = { userId: app.userId, publicAppId: app.appId };
    if (appCache.size >= MAX_CACHED_APPS) appCache.clear();
    appCache.set(appId, owner);
    return owner;
}

type Sink = (input: CaptureEventInput) => void;
let sink: Sink = captureEvent;
const pending = new Set<Promise<void>>();

export type TrackEventInput = {
    event: ProductEvent;
    /** Where it was sent from, e.g. `media.seal`. */
    source: string;
    /** The app's internal ID. Its owner becomes the subject when `userId`
     * isn't given, and its public ID the `app` group. */
    appId?: string | null;
    userId?: string | null;
    properties?: Record<string, unknown>;
};

/** Sends a product event. Never throws, never blocks the caller. */
export function trackEvent(input: TrackEventInput): void {
    const work = send(input).catch((err) => {
        logger.debug({ err, event: input.event }, "product event not sent");
    });
    pending.add(work);
    void work.finally(() => pending.delete(work));
}

async function send(input: TrackEventInput): Promise<void> {
    const owner = input.appId ? await appOwner(input.appId) : null;
    const subject = input.userId ?? owner?.userId ?? SYSTEM_SUBJECT;
    sink({
        event: input.event,
        source: input.source,
        subjectId: subject,
        properties: {
            ...(input.properties ?? {}),
            ...(input.appId ? { app_id: input.appId } : {}),
        },
        ...(owner ? { groups: { app: owner.publicAppId } } : {}),
        dedupe: false,
    });
}

/** For tests: send events to `next` instead of PostHog. Returns a function
 * that restores the real sink. */
export function setEventSinkForTests(next: Sink): () => void {
    const previous = sink;
    sink = next;
    return () => {
        sink = previous;
    };
}

/** For tests: waits for events still being sent. */
export async function flushEventsForTests(): Promise<void> {
    while (pending.size > 0) await Promise.all([...pending]);
}

/** For tests. */
export function clearAppCacheForTests(): void {
    appCache.clear();
}
