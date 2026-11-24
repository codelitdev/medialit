import type { Executor } from "./derivatives.js";
import { claimSeal, commitSeal } from "./repository.js";

/** Seals uploaded temp media the way seal does, without the files. Does
 * nothing when the media isn't uploaded temp media. For tests. */
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
