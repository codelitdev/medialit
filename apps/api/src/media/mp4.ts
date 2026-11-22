/**
 * MP4 optimized for the web (pipelines-phase-1.md, D7): H.264 and AAC with
 * the index at the front, so playback starts before the whole file loads.
 * A source that is already H.264/AAC in MP4 or MOV, at most 1080p and
 * 8 Mbps, is remuxed (`-c copy`): seconds, no quality lost, no minutes
 * charged. Anything else is re-encoded, never upscaled. The original is
 * kept; the output is the `mp4` derivative, `web.mp4`.
 */
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { runLimited } from "@medialit/images";
import { cloudBucket } from "../config/constants";
import { streamToObject } from "../services/s3";
import { PROBE_INPUT_FORMATS, type ProbeResult } from "./probe";
import { videoJob, type EncodeInput } from "./video-job";
import { MP4_JOB_TYPE, VIDEO_ENCODE_ATTEMPTS } from "./processing-plan";

export const MP4_JOB = MP4_JOB_TYPE;
export const MP4_KEY = "web.mp4";
export const MP4_ATTEMPTS = VIDEO_ENCODE_ATTEMPTS;

/** The largest MP4 made, on the short side (D7: fixed for now). */
export const MP4_MAX_SHORT_SIDE = 1080;
/** A remux keeps the source's bitrate, so it must be no more than this. */
export const MP4_REMUX_MAX_BITRATE = 8_000_000;

/** The 1080p rendition's settings (D5), shared with HLS. */
export const H264_1080P = { maxrateKbps: 5000, crf: 21 };

/** True when the source can be remuxed instead of re-encoded. */
export function canRemux(probe: ProbeResult): boolean {
    const { metadata, details } = probe;
    const shortSide = Math.min(metadata.width ?? 0, metadata.height ?? 0);
    return (
        metadata.videoCodec === "h264" &&
        details.pixelFormat === "yuv420p" &&
        (!details.hasAudio || metadata.audioCodec === "aac") &&
        details.formatNames.some((name) => name === "mov" || name === "mp4") &&
        shortSide > 0 &&
        shortSide <= MP4_MAX_SHORT_SIDE &&
        (metadata.bitrate ?? Infinity) <= MP4_REMUX_MAX_BITRATE
    );
}

/**
 * Scales so the short side is at most `maxShortSide`, never up, keeping the
 * aspect ratio with even sides (H.264 needs them). ffmpeg has already
 * applied rotation, so `iw` and `ih` are as displayed.
 */
export function capShortSide(maxShortSide: number): string {
    const even = (expr: string) => `trunc(${expr}/2)*2`;
    return (
        `scale=w='if(gte(iw,ih),-2,${even(`min(${maxShortSide},iw)`)})'` +
        `:h='if(gte(iw,ih),${even(`min(${maxShortSide},ih)`)},-2)'`
    );
}

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

/** The first video and audio stream only; no subtitles, data, attachments
 * or metadata such as a phone's location. */
export const STREAMS = [
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
];

export const AAC_STEREO = [
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",
];

export function mp4Args(input: {
    source: string;
    output: string;
    remux: boolean;
    maxDurationSeconds: number;
    threads?: number;
}): string[] {
    const common = [
        ...localInput(input.source, input.threads),
        ...(input.threads ? ["-threads", String(input.threads)] : []),
        ...STREAMS,
        "-t",
        String(input.maxDurationSeconds),
    ];
    const codecs = input.remux
        ? ["-c", "copy"]
        : [
              "-vf",
              capShortSide(MP4_MAX_SHORT_SIDE),
              "-fpsmax",
              "60",
              "-c:v",
              "libx264",
              "-preset",
              "veryfast",
              "-profile:v",
              "high",
              "-pix_fmt",
              "yuv420p",
              "-crf",
              String(H264_1080P.crf),
              "-maxrate",
              `${H264_1080P.maxrateKbps}k`,
              "-bufsize",
              `${Math.round(H264_1080P.maxrateKbps * 1.5)}k`,
              ...AAC_STEREO,
          ];
    return [
        ...common,
        ...codecs,
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        input.output,
    ];
}

/** A re-encode's maximum rate: the 1080p video cap plus stereo AAC. */
export const MP4_MAX_KBPS = H264_1080P.maxrateKbps + 128;

async function encodeMp4(input: EncodeInput) {
    const remux = canRemux(input.probe);
    // A remux copies the streams: its output is about the source's size.
    // A re-encode is bounded by its rate and the disk budget.
    const maxSeconds = remux
        ? input.limits.maxDurationSeconds
        : input.maxOutputSeconds(MP4_MAX_KBPS);
    // A remux costs seconds and no minutes (D8).
    const minutesCharged = remux ? 0 : await input.reserve();
    const output = path.join(input.workDir, MP4_KEY);
    await runLimited(
        "ffmpeg",
        mp4Args({
            source: input.source,
            output,
            remux,
            maxDurationSeconds: maxSeconds,
            threads: input.limits.threads,
        }),
        {
            timeoutMs: input.timeoutMs,
            memoryMb: input.limits.maxMemoryMb,
            signal: input.signal,
        },
    );
    const size = (await stat(output)).size;
    await streamToObject({
        Key: `${input.context.privateFolder}${MP4_KEY}`,
        Body: createReadStream(output),
        ContentType: "video/mp4",
        Bucket: cloudBucket,
    }).done();
    return {
        output: { key: MP4_KEY, mimeType: "video/mp4", size },
        remux,
        minutesCharged,
    };
}

export const mp4Job = videoJob({
    type: MP4_JOB,
    name: "mp4",
    maxAttempts: MP4_ATTEMPTS,
    encode: encodeMp4,
});
