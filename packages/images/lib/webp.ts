import { stat } from "node:fs/promises";
import { checkImageFile, type ImageLimits } from "./limits";
import { ProcessLimitError, runLimited } from "./process";
import type { Slots } from "./slots";

/** Formats `cwebp` reads. */
const CWEBP_INPUT_FORMATS = new Set(["png", "jpeg"]);

export type WebpResult =
    | { status: "converted"; size: number }
    /** Not attempted: the original is kept, and that's expected. */
    | {
          status: "skipped";
          reason: "busy" | "too_large" | "too_many_pixels";
          message: string;
      }
    /** Attempted and failed: the original is kept. */
    | { status: "failed"; reason: "timeout" | "failed"; message: string };

export interface ConvertToWebpOptions {
    /** `cwebp -q`, 0 to 100. */
    quality: number;
    limits: ImageLimits;
    /** The process's conversion slots, sized `limits.concurrency`. */
    slots: Slots;
    /** Aborts the wait for a slot and kills a running conversion. An abort
     * rejects with a `ProcessLimitError` whose reason is `aborted`. */
    signal?: AbortSignal;
    /** Called once if `prlimit` isn't installed. */
    onNoPrlimit?: () => void;
}

function abortedError(): ProcessLimitError {
    return new ProcessLimitError("The conversion was aborted", "aborted");
}

/**
 * Converts a local PNG or JPEG file to WebP at `output`, within `limits`:
 *
 * 1. Inputs over `maxInputBytes`, or whose header declares more than
 *    `maxPixels` pixels, are skipped. The header is read without decoding.
 * 2. It waits up to `queueWaitMs` for one of `slots`, and is skipped as
 *    `busy` if none frees up.
 * 3. `cwebp` runs without a shell, in its own process group, under
 *    `prlimit --as` of `maxMemoryMb`. After `timeoutMs` the whole group is
 *    killed.
 *
 * Never throws for a bad or oversized image: the result says what happened.
 * Throws only when `signal` aborts it.
 */
export async function convertToWebp(
    input: string,
    output: string,
    options: ConvertToWebpOptions,
): Promise<WebpResult> {
    const { limits, slots, signal } = options;
    if (signal?.aborted) throw abortedError();

    const check = await checkImageFile(input, limits);
    if (!check.ok) {
        if (check.reason === "unreadable") {
            return {
                status: "failed",
                reason: "failed",
                message: check.message,
            };
        }
        return {
            status: "skipped",
            reason: check.reason,
            message: check.message,
        };
    }
    if (!CWEBP_INPUT_FORMATS.has(check.info.format)) {
        return {
            status: "failed",
            reason: "failed",
            message: `Can't convert ${check.info.format} images to WebP`,
        };
    }

    const release = await slots.acquire(limits.queueWaitMs, signal);
    if (signal?.aborted) {
        release?.();
        throw abortedError();
    }
    if (!release) {
        return {
            status: "skipped",
            reason: "busy",
            message: `No free conversion slot within ${limits.queueWaitMs} ms`,
        };
    }
    try {
        const quality = Math.min(100, Math.max(0, Math.round(options.quality)));
        await runLimited(
            "cwebp",
            ["-quiet", "-q", String(quality), input, "-o", output],
            {
                timeoutMs: limits.timeoutMs,
                memoryMb: limits.maxMemoryMb,
                signal,
                onNoPrlimit: options.onNoPrlimit,
            },
        );
        return { status: "converted", size: (await stat(output)).size };
    } catch (err) {
        if (err instanceof ProcessLimitError) {
            if (err.reason === "aborted") throw err;
            return {
                status: "failed",
                reason: err.reason,
                message: err.message,
            };
        }
        return {
            status: "failed",
            reason: "failed",
            message: (err as Error)?.message || "The conversion failed",
        };
    } finally {
        release();
    }
}
