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
import type { ProbeResult } from "./probe";
import { videoJob, type EncodeInput } from "./video-job";
import { MP4_JOB_TYPE } from "./processing-plan";
import {
    AAC_KBPS,
    AAC_STEREO,
    H264,
    LADDER,
    NO_EXTRAS,
    localInput,
    rateCap,
} from "./h264";

const MP4_KEY = "web.mp4";
/** The largest MP4 made, on the short side (D7: fixed for now). */
const MP4_MAX_SHORT_SIDE = 1080;
const MP4_MAXRATE_KBPS = LADDER["1080p"].maxrateKbps;
/** A remux keeps the source's bitrate, so it must be no more than this. */
const MP4_REMUX_MAX_BITRATE = 8_000_000;

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
function capShortSide(maxShortSide: number): string {
    const even = (expr: string) => `trunc(${expr}/2)*2`;
    return (
        `scale=w='if(gte(iw,ih),-2,${even(`min(${maxShortSide},iw)`)})'` +
        `:h='if(gte(iw,ih),${even(`min(${maxShortSide},ih)`)},-2)'`
    );
}

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
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        ...NO_EXTRAS,
        "-t",
        String(input.maxDurationSeconds),
    ];
    const codecs = input.remux
        ? ["-c", "copy"]
        : [
              "-vf",
              capShortSide(MP4_MAX_SHORT_SIDE),
              ...H264,
              ...rateCap(MP4_MAXRATE_KBPS),
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

async function encodeMp4(input: EncodeInput) {
    const remux = canRemux(input.probe);
    // A remux copies the streams: its output is about the source's size.
    // A re-encode is bounded by its rate and the disk budget.
    const maxSeconds = remux
        ? input.limits.maxDurationSeconds
        : input.maxOutputSeconds(MP4_MAXRATE_KBPS + AAC_KBPS);
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
            signal: input.context.signal,
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
    type: MP4_JOB_TYPE,
    name: "mp4",
    encode: encodeMp4,
});
