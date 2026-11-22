import { runLimited } from "@medialit/images";

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

/** The largest thumbnail side, whatever the settings say. */
export const MAX_THUMBNAIL_SIDE = 4096;

/** ffmpeg's own limit on a single network read or write, in microseconds. */
const NETWORK_TIMEOUT_US = "30000000";

export interface ThumbnailSize {
    width: number;
    height: number;
}

function side(value: number, label: string): number {
    if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Thumbnail ${label} must be a positive number`);
    }
    return Math.min(MAX_THUMBNAIL_SIDE, Math.round(value));
}

/**
 * The ffmpeg filter that scales a frame to cover `width` × `height`, keeping
 * its aspect ratio, then crops the overflow from the center. The result is
 * exactly `width` × `height`.
 */
export function coverFilter(size: ThumbnailSize): string {
    const width = side(size.width, "width");
    const height = side(size.height, "height");
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

/**
 * Image thumbnails without a size, as MediaLit always made them: cropped to
 * 16:9 from the center, then scaled down to at most 480 pixels tall. Each
 * side is at least 1 pixel, so tiny images work too.
 */
export const DEFAULT_IMAGE_FILTER =
    "crop=w='max(1,if(gt(trunc(iw*9/16),ih),trunc(ih*16/9),iw))'" +
    ":h='max(1,if(gt(trunc(iw*9/16),ih),ih,trunc(iw*9/16)))'," +
    "scale=w='if(gt(ih,480),853,iw)':h='min(ih,480)'";

/** Video thumbnails without a size: the first frame, 720 pixels tall. */
export const DEFAULT_VIDEO_FILTER = "scale=-2:720";

function checkPaths(source: string, destination: string): void {
    if (!source || !destination) {
        throw new Error("Source or destination path missing");
    }
}

function runFfmpeg(args: string[]): Promise<void> {
    // No shell: paths contain a client-controlled extension. Its own process
    // group, killed on timeout.
    return runLimited("ffmpeg", args, { timeoutMs: THUMBNAIL_TIMEOUT_MS });
}

/**
 * Makes a thumbnail of a local image file: exactly `size` (resized and
 * cropped) when given, otherwise `DEFAULT_IMAGE_FILTER`.
 */
async function forImage(
    source: string,
    destination: string,
    size?: ThumbnailSize,
): Promise<void> {
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
        size ? coverFilter(size) : DEFAULT_IMAGE_FILTER,
        destination,
    ]);
}

/**
 * Makes a thumbnail of a video's first frame: exactly `size` (resized and
 * cropped) when given, otherwise `DEFAULT_VIDEO_FILTER`. `source` is a URL
 * MediaLit made; ffmpeg reads only the bytes it needs.
 */
async function forVideo(
    source: string,
    destination: string,
    size?: ThumbnailSize,
): Promise<void> {
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
        size ? coverFilter(size) : DEFAULT_VIDEO_FILTER,
        destination,
    ]);
}

export default {
    forImage,
    forVideo,
};
