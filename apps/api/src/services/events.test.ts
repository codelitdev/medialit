import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type {
    CaptureClient,
    CaptureEventInput,
} from "@codelitdev/observability";
import {
    SYSTEM_SUBJECT,
    flushEventsForTests,
    setEventSinkForTests,
    trackEvent,
} from "./events.js";
import { createMedialitObservability } from "./log.js";

let restore: (() => void) | undefined;
afterEach(() => {
    restore?.();
    restore = undefined;
});

function collect(): CaptureEventInput[] {
    const sent: CaptureEventInput[] = [];
    restore = setEventSinkForTests((input) => sent.push(input));
    return sent;
}

describe("trackEvent", () => {
    test("sends under the account, counting every occurrence", async () => {
        const sent = collect();
        trackEvent({
            event: "media.uploaded",
            source: "media.upload",
            userId: "user-1",
            properties: { media_id: "m1", size_bytes: 10 },
        });
        trackEvent({
            event: "media.uploaded",
            source: "media.upload",
            userId: "user-1",
            properties: { media_id: "m1", size_bytes: 10 },
        });
        await flushEventsForTests();
        assert.equal(sent.length, 2);
        assert.deepEqual(sent[0], {
            event: "media.uploaded",
            source: "media.upload",
            subjectId: "user-1",
            properties: { media_id: "m1", size_bytes: 10 },
            dedupe: false,
        });
    });

    test("reports work with no account as system", async () => {
        const sent = collect();
        trackEvent({ event: "media.deleted", source: "test" });
        await flushEventsForTests();
        assert.equal(sent[0].subjectId, SYSTEM_SUBJECT);
        assert.equal(sent[0].groups, undefined);
    });

    test("never throws, even when sending fails", async () => {
        restore = setEventSinkForTests(() => {
            throw new Error("PostHog is down");
        });
        assert.doesNotThrow(() =>
            trackEvent({
                event: "media.sealed",
                source: "test",
                userId: "user-1",
            }),
        );
        await flushEventsForTests();
    });
});

describe("the event allowlist", () => {
    test("drops file names, URLs and hosts, and keeps IDs and groups", async () => {
        const captured: Array<{
            event: string;
            distinctId: string;
            properties: Record<string, unknown>;
        }> = [];
        const client: CaptureClient = {
            captureException: () => {},
            capture: (input) => captured.push(input),
            shutdown: async () => {},
        };
        const events = createMedialitObservability(
            { POSTHOG_API_KEY: "phc_test", NODE_ENV: "test" },
            { client, purpose: "events", service: "medialit-test" },
        );
        const mediaId = "a".repeat(40);
        events.captureEvent({
            event: "media.uploaded",
            source: "media.upload",
            subjectId: "user-1",
            groups: { app: "public-app-id" },
            dedupe: false,
            properties: {
                media_id: mediaId,
                media_kind: "video",
                size_bytes: 1234,
                file_name: "holiday.mp4",
                original_file_name: "holiday.mp4",
                url: "https://bucket.example.com/main.mp4?X-Amz-Signature=abc",
                host: "receiver.example.com",
                caption: "Our trip",
            },
        });
        await events.shutdown(1000);

        assert.equal(captured.length, 1);
        const { properties } = captured[0];
        assert.equal(captured[0].distinctId, "user-1");
        assert.equal(properties.media_id, mediaId);
        assert.equal(properties.media_kind, "video");
        assert.equal(properties.size_bytes, 1234);
        assert.deepEqual(properties.$groups, { app: "public-app-id" });
        for (const key of [
            "file_name",
            "original_file_name",
            "url",
            "host",
            "caption",
        ]) {
            assert.equal(key in properties, false, `${key} was sent`);
        }
        assert.doesNotMatch(JSON.stringify(properties), /holiday|example\.com/);
    });
});
