import { stat } from "node:fs/promises";
import { readImageInfoFromFile, type ImageInfo } from "./dimensions";

/**
 * Bounds on processing an untrusted image inside a shared process: bytes,
 * pixels, memory, time and concurrency.
 */
export interface ImageLimits {
    /** Larger inputs are not processed. */
    maxInputBytes: number;
    /** Images with more pixels (width × height, from the header) are not
     * processed. */
    maxPixels: number;
    /** Address-space limit for the converter process, via `prlimit --as`. */
    maxMemoryMb: number;
    /** The converter's process group is killed after this long. */
    timeoutMs: number;
    /** At most this many conversions run at once per process. */
    concurrency: number;
    /** How long to wait for a free conversion slot before giving up. */
    queueWaitMs: number;
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
    maxInputBytes: 25 * 1024 * 1024,
    maxPixels: 50_000_000,
    maxMemoryMb: 1024,
    timeoutMs: 30_000,
    concurrency: 2,
    queueWaitMs: 10_000,
};

function positiveNumber(value: string | undefined, fallback: number): number {
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads the limits from `WEBP_MAX_INPUT_BYTES`, `WEBP_MAX_PIXELS`,
 * `WEBP_MAX_MEMORY_MB`, `WEBP_TIMEOUT_MS`, `WEBP_CONCURRENCY` and
 * `WEBP_QUEUE_WAIT_MS`. Missing or invalid values use the defaults. */
export function imageLimitsFromEnv(
    env: Record<string, string | undefined> = process.env,
): ImageLimits {
    const d = DEFAULT_IMAGE_LIMITS;
    return {
        maxInputBytes: positiveNumber(
            env.WEBP_MAX_INPUT_BYTES,
            d.maxInputBytes,
        ),
        maxPixels: positiveNumber(env.WEBP_MAX_PIXELS, d.maxPixels),
        maxMemoryMb: positiveNumber(env.WEBP_MAX_MEMORY_MB, d.maxMemoryMb),
        timeoutMs: positiveNumber(env.WEBP_TIMEOUT_MS, d.timeoutMs),
        concurrency: Math.max(
            1,
            Math.floor(positiveNumber(env.WEBP_CONCURRENCY, d.concurrency)),
        ),
        queueWaitMs: positiveNumber(env.WEBP_QUEUE_WAIT_MS, d.queueWaitMs),
    };
}

/** Why an image is not processed. */
export type ImageLimitReason = "too_large" | "too_many_pixels" | "unreadable";

export type ImageCheck =
    | { ok: true; info: ImageInfo; bytes: number }
    | { ok: false; reason: ImageLimitReason; message: string };

/**
 * Checks a local image file against the byte and pixel limits, reading only
 * its size and header. Never decodes it.
 */
export async function checkImageFile(
    path: string,
    limits: Pick<ImageLimits, "maxInputBytes" | "maxPixels">,
): Promise<ImageCheck> {
    const bytes = (await stat(path)).size;
    if (bytes > limits.maxInputBytes) {
        return {
            ok: false,
            reason: "too_large",
            message: `The image is ${bytes} bytes, over the limit of ${limits.maxInputBytes}`,
        };
    }
    const info = await readImageInfoFromFile(path);
    if (!info || info.width < 1 || info.height < 1) {
        return {
            ok: false,
            reason: "unreadable",
            message: "The image header could not be read",
        };
    }
    if (info.width * info.height > limits.maxPixels) {
        return {
            ok: false,
            reason: "too_many_pixels",
            message: `The image is ${info.width}×${info.height} pixels, over the limit of ${limits.maxPixels}`,
        };
    }
    return { ok: true, info, bytes };
}
