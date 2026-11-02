import { spawn } from "child_process";

export type MediaProbe = {
    width?: number;
    height?: number;
    durationMs?: number;
};

const PROBE_TIMEOUT_MS = 15_000;

function positiveInteger(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number > 0
        ? Math.round(number)
        : undefined;
}

/** Reads what ffprobe printed as JSON. Exported for tests. */
export function parseProbeOutput(output: string): MediaProbe {
    let parsed: any;
    try {
        parsed = JSON.parse(output);
    } catch {
        return {};
    }
    const stream = parsed?.streams?.[0];
    let width = positiveInteger(stream?.width);
    let height = positiveInteger(stream?.height);
    // A phone records sideways and flags the file as rotated; people see it
    // upright, so report it that way.
    const rotation = Number(
        stream?.side_data_list?.find((entry: any) => "rotation" in entry)
            ?.rotation ?? stream?.tags?.rotate,
    );
    if (Number.isFinite(rotation) && Math.abs(rotation) % 180 === 90) {
        [width, height] = [height, width];
    }
    const seconds = Number(parsed?.format?.duration ?? stream?.duration);
    return {
        width,
        height,
        durationMs:
            Number.isFinite(seconds) && seconds > 0
                ? Math.round(seconds * 1000)
                : undefined,
    };
}

/**
 * Width, height and, for video, duration of an image or video. Never throws:
 * a file ffprobe cannot read just has no dimensions.
 */
export function probeMedia(
    filePath: string,
    mimeType: string,
): Promise<MediaProbe> {
    const isVideo = /^video\//i.test(mimeType);
    if (!isVideo && !/^image\//i.test(mimeType)) return Promise.resolve({});
    return new Promise((resolve) => {
        // No shell: the path is derived from a client-controlled extension.
        const child = spawn(
            "ffprobe",
            [
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-print_format",
                "json",
                "-show_entries",
                "stream=width,height,duration:stream_side_data=rotation:stream_tags=rotate:format=duration",
                filePath,
            ],
            { stdio: ["ignore", "pipe", "ignore"] },
        );
        let output = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), PROBE_TIMEOUT_MS);
        child.stdout.on("data", (chunk) => {
            output += chunk;
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({});
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            const probe: MediaProbe =
                code === 0 ? parseProbeOutput(output) : {};
            // A still image has no duration worth keeping.
            if (!isVideo) delete probe.durationMs;
            resolve(probe);
        });
    });
}
