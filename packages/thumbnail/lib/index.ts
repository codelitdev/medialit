import { spawn, type ChildProcess } from "child_process";
import path from "path";

const VIDEO_TYPE = "video";
const IMAGE_TYPE = "image";

type mediaType = "video" | "image";

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

/** Kills ffmpeg (and the image script's children) after this long. */
export const THUMBNAIL_TIMEOUT_MS = 60_000;

/** ffmpeg's own limit on a single network read or write, in microseconds. */
const NETWORK_TIMEOUT_US = "30000000";

const scriptPath = path.resolve(__dirname, "../bin/generate-thumbnail.sh");

/**
 * Runs a command in its own process group and kills the whole group on
 * timeout, so a script's children (ffprobe, ffmpeg) don't outlive it.
 */
function run(command: string, args: string[], timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
        let child: ChildProcess;
        try {
            child = spawn(command, args, {
                detached: true,
                stdio: ["ignore", "ignore", "pipe"],
            });
        } catch (err) {
            reject(err);
            return;
        }
        let settled = false;
        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (err) reject(err);
            else resolve();
        };
        const timer = setTimeout(() => {
            try {
                process.kill(-(child.pid as number), "SIGKILL");
            } catch {
                // Already gone.
            }
            finish(new Error(`${command} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        if (process.env.DEBUG === "true") {
            child.stderr?.on("data", (data: Buffer) => {
                console.error(data.toString());
            });
        } else {
            child.stderr?.resume();
        }
        child.on("error", (err) => finish(err));
        child.on("exit", (code) =>
            code === 0
                ? finish()
                : finish(new Error(`${command} exited with code ${code}`)),
        );
    });
}

const thumbGenerator = async (
    source: string,
    destination: string,
    type: mediaType,
) => {
    if (!source || !destination) {
        throw new Error("Source or destination path missing");
    }

    if (type === IMAGE_TYPE) {
        await run(scriptPath, [source, destination], THUMBNAIL_TIMEOUT_MS);
        return 1;
    }

    // No shell: source contains a client-controlled extension.
    await run(
        "ffmpeg",
        [
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
            "-vframes",
            "1",
            "-filter:v",
            "scale=-2:720",
            destination,
        ],
        THUMBNAIL_TIMEOUT_MS,
    );
    // Video thumbnails are the 720p frame as is. Cropping and resizing them
    // is #256 (the image script can't edit the frame in place).
    return 1;
};

const forImage = (source: string, destination: string) =>
    thumbGenerator(source, destination, IMAGE_TYPE);

const forVideo = (source: string, destination: string) =>
    thumbGenerator(source, destination, VIDEO_TYPE);

export default {
    forImage,
    forVideo,
};
