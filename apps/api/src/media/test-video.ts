import { execFileSync } from "node:child_process";

/** Writes a test pattern video to `file` with ffmpeg's lavfi source: H.264
 * (and AAC with `audio`) unless `codec` says otherwise. For tests. */
export function makeTestVideo(
    file: string,
    options: {
        size: string;
        seconds?: number;
        audio?: boolean;
        codec?: string[];
        ffmpeg?: string;
    },
): string {
    const seconds = options.seconds ?? 2;
    const codec = options.codec ?? [
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        ...(options.audio ? ["-c:a", "aac"] : []),
    ];
    execFileSync(options.ffmpeg ?? "ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=size=${options.size}:rate=25:duration=${seconds}`,
        ...(options.audio
            ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`]
            : []),
        ...codec,
        "-shortest",
        file,
    ]);
    return file;
}
