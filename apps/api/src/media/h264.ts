/** ffmpeg arguments shared by the MP4 and HLS encodes (phase 1, D5, D7). */
import { PROBE_INPUT_FORMATS } from "./probe";

/** The ladder (D5): short side and maximum video bitrate. MP4 uses 1080p. */
export const LADDER: Record<
    string,
    { shortSide: number; maxrateKbps: number }
> = {
    "1080p": { shortSide: 1080, maxrateKbps: 5000 },
    "720p": { shortSide: 720, maxrateKbps: 2800 },
    "480p": { shortSide: 480, maxrateKbps: 1400 },
    "360p": { shortSide: 360, maxrateKbps: 800 },
};

/** Input options for a local file: no network, and only real containers,
 * so a playlist posing as a video can't make ffmpeg open other files. */
export function localInput(source: string, threads?: number): string[] {
    return [
        "-nostdin",
        "-y",
        ...(threads ? ["-threads", String(threads)] : []),
        "-format_whitelist",
        PROBE_INPUT_FORMATS,
        "-protocol_whitelist",
        "file",
        "-i",
        source,
    ];
}

/** No subtitles, data, attachments or metadata such as a phone's location. */
export const NO_EXTRAS = [
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
];

/** H.264 with a capped CRF, at most 60 fps. Add `rateCap` for the cap. */
export const H264 = [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "21",
    "-fpsmax",
    "60",
];

/** The video rate cap, with a buffer of 1.5 times it. `stream` selects one
 * output stream, as `:v:0`. */
export function rateCap(maxrateKbps: number, stream = ""): string[] {
    return [
        `-maxrate${stream}`,
        `${maxrateKbps}k`,
        `-bufsize${stream}`,
        `${Math.round(maxrateKbps * 1.5)}k`,
    ];
}

export const AAC_KBPS = 128;

export const AAC_STEREO = [
    "-c:a",
    "aac",
    "-b:a",
    `${AAC_KBPS}k`,
    "-ac",
    "2",
    "-ar",
    "48000",
];
