import { rm, stat } from "node:fs/promises";
import { ProcessLimitError, runLimited } from "@medialit/images";

/**
 * Container formats ffmpeg may open for video thumbnails. Uploads are
 * untrusted, and ffmpeg picks a demuxer from the content, so without this a
 * playlist (HLS, DASH, SDP and the like) uploaded as a video makes ffmpeg
 * fetch whatever URLs it lists. Each name matches ffmpeg's demuxer name list
 * (`mov` covers mp4, m4v and 3gp; `matroska` covers webm).
 */
export const VIDEO_INPUT_FORMATS = "mov,matroska,avi,mpegts,flv,asf,mpeg,ogg";

/** Protocols for video input: the presigned URL MediaLit makes, nothing else. */
export const VIDEO_INPUT_PROTOCOLS = "http,https,tcp,tls";

/** Image formats ffmpeg may open for image thumbnails, from local files only. */
export const IMAGE_INPUT_FORMATS = "png_pipe,jpeg_pipe,webp_pipe,gif";

/** Kills ffmpeg's process group after this long. */
export const THUMBNAIL_TIMEOUT_MS = 60_000;

/** ffmpeg's own limit on a single network read or write, in microseconds. */
const NETWORK_TIMEOUT_US = "30000000";

/**
 * Image thumbnails, as MediaLit always made them: cropped to
 * 16:9 from the center, then scaled down to at most 480 pixels tall. Each
 * side is at least 1 pixel, so tiny images work too.
 */
export const DEFAULT_IMAGE_FILTER =
    "crop=w='max(1,if(gt(trunc(iw*9/16),ih),trunc(ih*16/9),iw))'" +
    ":h='max(1,if(gt(trunc(iw*9/16),ih),ih,trunc(iw*9/16)))'," +
    "scale=w='if(gt(ih,480),853,iw)':h='min(ih,480)'";

/** Video thumbnails: the first frame, 720 pixels tall. */
export const DEFAULT_VIDEO_FILTER = "scale=-2:720";

function checkPaths(source: string, destination: string): void {
    if (!source || !destination) {
        throw new Error("Source or destination path missing");
    }
}

function runFfmpeg(args: string[]): Promise<void> {
    // No shell: paths contain a client-controlled extension. Its own process
    // group, killed on timeout.
    return runLimited("ffmpeg", args, { timeoutMs: THUMBNAIL_TIMEOUT_MS }).then(
        () => undefined,
    );
}

/** Makes a thumbnail of a local image file with `DEFAULT_IMAGE_FILTER`. */
async function forImage(source: string, destination: string): Promise<void> {
    checkPaths(source, destination);
    await runFfmpeg([
        "-nostdin",
        "-y",
        "-format_whitelist",
        IMAGE_INPUT_FORMATS,
        "-protocol_whitelist",
        "file",
        "-i",
        source,
        "-frames:v",
        "1",
        "-filter:v",
        DEFAULT_IMAGE_FILTER,
        destination,
    ]);
}

/**
 * Makes a thumbnail of a video's first frame with `DEFAULT_VIDEO_FILTER`.
 * `source` is a URL MediaLit made; ffmpeg reads only the bytes it needs.
 */
async function forVideo(source: string, destination: string): Promise<void> {
    checkPaths(source, destination);
    await runFfmpeg([
        "-nostdin",
        "-y",
        "-format_whitelist",
        VIDEO_INPUT_FORMATS,
        "-protocol_whitelist",
        VIDEO_INPUT_PROTOCOLS,
        "-rw_timeout",
        NETWORK_TIMEOUT_US,
        "-i",
        source,
        "-frames:v",
        "1",
        "-filter:v",
        DEFAULT_VIDEO_FILTER,
        destination,
    ]);
}

/** Frames darker than this average luma (0-255) don't make a poster. */
export const POSTER_MIN_LUMA = 32;
/** The poster is the most representative of this many frames. */
export const POSTER_FRAMES = 50;
/** How far past the seek point the poster may look, in seconds. */
const POSTER_WINDOW_SECONDS = 20;

/** Where to look for a poster: 10% of the way in, at most 10 s, and the
 * start for videos under a second (phase 1, D9). */
export function posterSeekSeconds(durationSeconds?: number): number {
    if (!durationSeconds || durationSeconds < 1) return 0;
    return Math.round(Math.min(durationSeconds * 0.1, 10) * 1000) / 1000;
}

/** One still WebP image. When no frame gets through the filters, this
 * writes no file at all, which is how the fallback is detected. */
const STILL_WEBP = ["-c:v", "libwebp", "-f", "image2", "-update", "1"];

export interface PosterResult {
    /** True when every candidate frame was black, and the frame at the seek
     * point was used. */
    fallback: boolean;
}

/**
 * Makes a video's poster: from `seekSeconds` on, drops near-black frames and
 * lets ffmpeg's `thumbnail` filter pick the most representative of the next
 * `POSTER_FRAMES`. If every frame there is black, uses the frame at the
 * seek point. Sized like the upload thumbnail. `source` is a URL MediaLit
 * made; ffmpeg reads only the bytes it needs.
 */
async function forVideoPoster(
    source: string,
    destination: string,
    options: {
        seekSeconds: number;
        signal?: AbortSignal;
    },
): Promise<PosterResult> {
    checkPaths(source, destination);
    const scale = DEFAULT_VIDEO_FILTER;
    const input = [
        "-nostdin",
        "-y",
        "-ss",
        String(options.seekSeconds),
        "-format_whitelist",
        VIDEO_INPUT_FORMATS,
        "-protocol_whitelist",
        VIDEO_INPUT_PROTOCOLS,
        "-rw_timeout",
        NETWORK_TIMEOUT_US,
        "-i",
        source,
        "-an",
        "-sn",
        "-dn",
    ];
    await rm(destination, { force: true });
    await runLimited(
        "ffmpeg",
        [
            ...input,
            "-t",
            String(POSTER_WINDOW_SECONDS),
            "-filter:v",
            `signalstats,metadata=mode=select:key=lavfi.signalstats.YAVG:value=${POSTER_MIN_LUMA}:function=greater,thumbnail=${POSTER_FRAMES},${scale}`,
            "-frames:v",
            "1",
            ...STILL_WEBP,
            destination,
        ],
        { timeoutMs: THUMBNAIL_TIMEOUT_MS, signal: options.signal },
    ).catch((err: unknown) => {
        // No frame passed the filter: ffmpeg may fail on an empty output.
        if (!(err instanceof ProcessLimitError) || err.reason !== "failed") {
            throw err;
        }
    });
    if ((await size(destination)) > 0) return { fallback: false };
    await runLimited(
        "ffmpeg",
        [
            ...input,
            "-frames:v",
            "1",
            "-filter:v",
            scale,
            ...STILL_WEBP,
            destination,
        ],
        { timeoutMs: THUMBNAIL_TIMEOUT_MS, signal: options.signal },
    );
    return { fallback: true };
}

async function size(file: string): Promise<number> {
    try {
        return (await stat(file)).size;
    } catch {
        return 0;
    }
}

export default {
    forImage,
    forVideo,
    forVideoPoster,
};
