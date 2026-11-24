/** Records for the Postgres tests. */
import { getDb } from "./client.js";
import { upsertDerivative, type Executor } from "./derivatives.js";
import {
    claimSeal,
    commitSeal,
    createAccount,
    createApp,
    createMediaRecord,
} from "./repository.js";

/** Seals uploaded temp media the way seal does, without the files. Does
 * nothing when the media isn't uploaded temp media. */
export async function sealForTests(input: {
    userId: string;
    appId: string;
    mediaId: string;
    inTransaction?: (tx: Executor, mediaRowId: string) => Promise<void>;
}): Promise<void> {
    const token = "test-seal";
    const claim = await claimSeal({ ...input, token, claimMs: 60_000 });
    if (claim.status !== "claimed") return;
    await commitSeal({
        mediaRowId: claim.mediaRowId,
        token,
        processingStatus: "ready",
        metadata: null,
        inTransaction: input.inTransaction ?? (async () => {}),
    });
}

/** A new account with one app. */
export async function createOwner() {
    const user = await createAccount({
        email: `owner-${Date.now()}-${Math.random()}@example.com`,
    });
    const app = await createApp({
        userId: user.id,
        name: `App ${Math.random()}`,
    });
    return { user, app };
}

/** Sealed video whose processing is under way, for a new owner unless one
 * is given. `queued` adds a queued derivative of that name. */
export async function createProcessingMedia(
    options: {
        owner?: Awaited<ReturnType<typeof createOwner>>;
        access?: "public" | "private";
        size?: number;
        queued?: string;
    } = {},
) {
    const { user, app } = options.owner ?? (await createOwner());
    const media = await createMediaRecord({
        fileName: "main.mp4",
        mediaId: `media-${Math.random().toString(36).slice(2)}`,
        userId: user.id,
        appId: app.id,
        originalFileName: "a.mp4",
        mimeType: "video/mp4",
        size: options.size ?? 10,
        thumbnailGenerated: false,
        accessControl: options.access ?? "private",
        temp: false,
        processingStatus: "processing",
    });
    if (options.queued) {
        await upsertDerivative(getDb(), {
            mediaRowId: media.id,
            name: options.queued,
            status: "queued",
        });
    }
    return { user, app, media };
}

/** Polls `check` until it returns a truthy value, and returns it. */
export async function waitFor<T>(
    check: () => Promise<T | undefined | null | false>,
    timeoutMs = 10_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await check();
        if (value) return value;
        if (Date.now() > deadline) throw new Error("timed out waiting");
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}
