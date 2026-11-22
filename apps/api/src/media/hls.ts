/**
 * HLS with adaptive bitrate (pipelines-phase-1.md, D5). One ffmpeg run
 * decodes the source once and writes every rendition: H.264 (capped CRF)
 * and AAC stereo, 6-second fMP4 segments with keyframes every 2 seconds so
 * renditions switch cleanly. Renditions larger than the source are skipped;
 * if none fit, one is made at the source's size.
 *
 * Layout under the media's folder: `hls/master.m3u8`, and for each
 * rendition `hls/v{n}/index.m3u8`, `hls/v{n}/init_{n}.mp4` and
 * `hls/v{n}/seg{nnnnn}.m4s`. All URIs in the playlists are relative.
 */
import path from "node:path";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { runLimited } from "@medialit/images";
import { cloudBucket } from "../config/constants";
import { deleteFolder, streamToObject } from "../services/s3";
import {
    DEFAULT_HLS_RENDITIONS,
    HLS_RENDITIONS,
} from "../media-settings/video";
import { AAC_STEREO, STREAMS, localInput } from "./mp4";
import { HLS_JOB_TYPE, VIDEO_ENCODE_ATTEMPTS } from "./processing-plan";
import { videoJob, type EncodeInput } from "./video-job";

export const HLS_JOB = HLS_JOB_TYPE;
export const HLS_PREFIX = "hls/";
export const HLS_SEGMENT_SECONDS = 6;
export const HLS_KEYFRAME_SECONDS = 2;

/** The ladder (D5): short side and maximum video bitrate. */
export const LADDER: Record<
    string,
    { shortSide: number; maxrateKbps: number }
> = {
    "1080p": { shortSide: 1080, maxrateKbps: 5000 },
    "720p": { shortSide: 720, maxrateKbps: 2800 },
    "480p": { shortSide: 480, maxrateKbps: 1400 },
    "360p": { shortSide: 360, maxrateKbps: 800 },
};

export type Rendition = {
    name: string;
    /** Width and height as displayed, both even. */
    width: number;
    height: number;
    maxrateKbps: number;
};

function even(value: number): number {
    return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * The renditions to make: the chosen ones no larger than the source,
 * compared on the short side, so a portrait 1080x1920 video counts as
 * 1080p. If none fit, one at the source's size, with the bitrate of the
 * smallest ladder step at or above it.
 */
export function planRenditions(
    chosen: readonly string[],
    source: { width: number; height: number },
): Rendition[] {
    const portrait = source.height > source.width;
    const sourceShort = Math.min(source.width, source.height);
    const sourceLong = Math.max(source.width, source.height);
    const size = (shortSide: number) => {
        const long = even((sourceLong * shortSide) / sourceShort);
        const short = even(shortSide);
        return portrait
            ? { width: short, height: long }
            : { width: long, height: short };
    };
    const names = HLS_RENDITIONS.filter((name) => chosen.includes(name));
    const fit = names.filter((name) => LADDER[name].shortSide <= sourceShort);
    if (fit.length > 0) {
        return fit.map((name) => ({
            name,
            ...size(LADDER[name].shortSide),
            maxrateKbps: LADDER[name].maxrateKbps,
        }));
    }
    const step =
        [...HLS_RENDITIONS]
            .reverse()
            .find((name) => LADDER[name].shortSide >= sourceShort) ??
        HLS_RENDITIONS[HLS_RENDITIONS.length - 1];
    return [
        {
            name: `${even(sourceShort)}p`,
            ...size(sourceShort),
            maxrateKbps: LADDER[step].maxrateKbps,
        },
    ];
}

export function hlsArgs(input: {
    source: string;
    outDir: string;
    renditions: Rendition[];
    hasAudio: boolean;
    maxDurationSeconds: number;
    threads?: number;
}): string[] {
    const n = input.renditions.length;
    const split =
        n === 1
            ? `[0:v]scale=w=${input.renditions[0].width}:h=${input.renditions[0].height}[v0]`
            : `[0:v]split=${n}${input.renditions.map((_, i) => `[s${i}]`).join("")};` +
              input.renditions
                  .map(
                      (r, i) =>
                          `[s${i}]scale=w=${r.width}:h=${r.height}[v${i}]`,
                  )
                  .join(";");
    const maps = input.renditions.flatMap((_, i) => [
        "-map",
        `[v${i}]`,
        ...(input.hasAudio ? ["-map", "0:a:0"] : []),
    ]);
    const rates = input.renditions.flatMap((r, i) => [
        `-maxrate:v:${i}`,
        `${r.maxrateKbps}k`,
        `-bufsize:v:${i}`,
        `${Math.round(r.maxrateKbps * 1.5)}k`,
    ]);
    const streamMap = input.renditions
        .map((_, i) => (input.hasAudio ? `v:${i},a:${i}` : `v:${i}`))
        .join(" ");
    // STREAMS minus its maps: the filter graph picks the video here.
    const noExtras = STREAMS.filter(
        (arg, i, all) => arg !== "-map" && all[i - 1] !== "-map",
    );
    const threads = input.threads ? String(input.threads) : undefined;
    return [
        ...localInput(input.source, input.threads),
        ...(threads ? ["-filter_complex_threads", threads] : []),
        "-filter_complex",
        split,
        ...maps,
        ...noExtras,
        "-t",
        String(input.maxDurationSeconds),
        ...(threads ? ["-threads", threads] : []),
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
        ...rates,
        "-force_key_frames",
        `expr:gte(t,n_forced*${HLS_KEYFRAME_SECONDS})`,
        "-sc_threshold",
        "0",
        "-fpsmax",
        "60",
        ...(input.hasAudio ? AAC_STEREO : []),
        "-f",
        "hls",
        "-hls_time",
        String(HLS_SEGMENT_SECONDS),
        "-hls_playlist_type",
        "vod",
        "-hls_segment_type",
        "fmp4",
        "-hls_fmp4_init_filename",
        "init.mp4",
        "-hls_segment_filename",
        path.join(input.outDir, "v%v", "seg%05d.m4s"),
        "-master_pl_name",
        "master.m3u8",
        "-var_stream_map",
        streamMap,
        path.join(input.outDir, "v%v", "index.m3u8"),
    ];
}

/** Every file under `dir`, as paths relative to it. */
async function listFiles(dir: string, prefix = ""): Promise<string[]> {
    const entries = await readdir(path.join(dir, prefix), {
        withFileTypes: true,
    });
    const files: string[] = [];
    for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            files.push(...(await listFiles(dir, relative)));
        else files.push(relative);
    }
    return files;
}

export function hlsContentType(file: string): string {
    if (file.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
    if (file.endsWith(".m4s")) return "video/iso.segment";
    return "video/mp4";
}

async function encodeHls(input: EncodeInput) {
    const chosen = Array.isArray(input.params.hlsRenditions)
        ? (input.params.hlsRenditions as string[])
        : [...DEFAULT_HLS_RENDITIONS];
    const renditions = planRenditions(chosen, {
        width: input.probe.metadata.width ?? 0,
        height: input.probe.metadata.height ?? 0,
    });
    // Every rendition at its cap, plus stereo AAC in each.
    const maxSeconds = input.maxOutputSeconds(
        renditions.reduce((sum, r) => sum + r.maxrateKbps + 128, 0),
    );
    const minutesCharged = await input.reserve();
    const outDir = path.join(input.workDir, "hls");
    await runLimited(
        "ffmpeg",
        hlsArgs({
            source: input.source,
            outDir,
            renditions,
            hasAudio: input.probe.details.hasAudio,
            maxDurationSeconds: maxSeconds,
            threads: input.limits.threads,
        }),
        {
            timeoutMs: input.timeoutMs,
            memoryMb: input.limits.maxMemoryMb,
            signal: input.signal,
        },
    );

    // An earlier attempt may have uploaded part of a ladder; start clean.
    const prefix = `${input.context.privateFolder}${HLS_PREFIX}`;
    await deleteFolder(prefix, cloudBucket);
    let size = 0;
    for (const file of await listFiles(outDir)) {
        const local = path.join(outDir, file);
        size += (await stat(local)).size;
        await streamToObject({
            Key: `${prefix}${file}`,
            Body: createReadStream(local),
            ContentType: hlsContentType(file),
            Bucket: cloudBucket,
        }).done();
    }
    return {
        output: {
            key: HLS_PREFIX,
            mimeType: "application/vnd.apple.mpegurl",
            size,
        },
        renditions: renditions.map((r) => r.name),
        minutesCharged,
    };
}

export const hlsJob = videoJob({
    type: HLS_JOB,
    name: "hls",
    maxAttempts: VIDEO_ENCODE_ATTEMPTS,
    encode: encodeHls,
});
