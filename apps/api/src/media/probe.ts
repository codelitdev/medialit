/**
 * Media metadata (pipelines-phase-1.md, D2): duration, size, codecs and the
 * like, read with `ffprobe` for audio and video and from the header for
 * images. Seal reads it with tight limits; video jobs read it again from
 * their downloaded copy.
 *
 * Uploads are untrusted. ffprobe runs without a shell, in its own process
 * group, with the container allowlist the thumbnail uses (so a playlist
 * uploaded as a video can't make it fetch other URLs), and is killed when
 * it runs too long.
 */
import { readImageInfoFromBuffer, runLimited } from "@medialit/images";
import {
    VIDEO_INPUT_FORMATS,
    VIDEO_INPUT_PROTOCOLS,
} from "@medialit/thumbnail";

import type { MediaMetadata } from "../db/schema";

export type { MediaMetadata };

/** What video jobs need beyond the public metadata (D4, D7). */
export type ProbeDetails = {
    hasVideo: boolean;
    hasAudio: boolean;
    /** Coded size, before rotation. */
    codedWidth?: number;
    codedHeight?: number;
    pixelFormat?: string;
    videoProfile?: string;
    /** Every name ffprobe gives the container, e.g. mov,mp4,m4a. */
    formatNames: string[];
};

export type ProbeResult = { metadata: MediaMetadata; details: ProbeDetails };

/** Audio-only containers, on top of the video ones (`mov` covers m4a). */
export const AUDIO_INPUT_FORMATS = "mp3,wav,aac,flac";
export const PROBE_INPUT_FORMATS = `${VIDEO_INPUT_FORMATS},${AUDIO_INPUT_FORMATS}`;

/** ffprobe's JSON for one file is small; anything larger is refused. */
const MAX_PROBE_OUTPUT = 256 * 1024;

export type ProbeOptions = {
    timeoutMs: number;
    /** Bytes and microseconds ffprobe may read to work out the streams.
     * Unset uses ffprobe's own defaults (5 MB, 5 s). */
    probeBytes?: number;
    signal?: AbortSignal;
};

/** Probes a URL MediaLit made, or a local file (a path, no scheme). */
export async function probeMedia(
    input: string,
    options: ProbeOptions,
): Promise<ProbeResult | null> {
    const remote = /^https?:\/\//i.test(input);
    const args = [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        ...(options.probeBytes
            ? [
                  "-probesize",
                  String(options.probeBytes),
                  "-analyzeduration",
                  String(options.probeBytes),
              ]
            : []),
        "-format_whitelist",
        PROBE_INPUT_FORMATS,
        "-protocol_whitelist",
        remote ? VIDEO_INPUT_PROTOCOLS : "file",
        ...(remote ? ["-rw_timeout", String(options.timeoutMs * 1000)] : []),
        "-i",
        input,
    ];
    const { stdout } = await runLimited("ffprobe", args, {
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        captureStdoutBytes: MAX_PROBE_OUTPUT,
    });
    return parseProbe(stdout);
}

type ProbeStream = {
    codec_type?: string;
    codec_name?: string;
    profile?: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    sample_rate?: string;
    channels?: number;
    duration?: string;
    disposition?: { attached_pic?: number };
    tags?: Record<string, string>;
    side_data_list?: Array<{ rotation?: number | string }>;
};

type ProbeOutput = {
    streams?: ProbeStream[];
    format?: { format_name?: string; duration?: string; bit_rate?: string };
};

function positive(value: unknown): number | undefined {
    const number = typeof value === "string" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) && number > 0
        ? number
        : undefined;
}

function frameRate(value?: string): number | undefined {
    if (!value) return undefined;
    const [num, den] = value.split("/").map(Number);
    const rate = den ? num / den : num;
    return positive(rate) ? Math.round(rate * 1000) / 1000 : undefined;
}

function rotation(stream: ProbeStream): 0 | 90 | 180 | 270 {
    const raw =
        stream.side_data_list?.find((d) => d.rotation !== undefined)
            ?.rotation ?? stream.tags?.rotate;
    const degrees = Number(raw);
    if (!Number.isFinite(degrees)) return 0;
    // ffprobe reports display matrix rotation counter-clockwise (-90 is a
    // phone held upright); normalise to 0, 90, 180 or 270.
    const turned = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
    return turned as 0 | 90 | 180 | 270;
}

/** Parses ffprobe's JSON. Null when it shows neither video nor audio. */
export function parseProbe(json: string): ProbeResult | null {
    let output: ProbeOutput;
    try {
        output = JSON.parse(json) as ProbeOutput;
    } catch {
        return null;
    }
    const streams = output.streams ?? [];
    // Cover art in an audio file is a video stream marked attached_pic.
    const video = streams.find(
        (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
    );
    const audio = streams.find((s) => s.codec_type === "audio");
    if (!video && !audio) return null;

    const formatNames = (output.format?.format_name ?? "")
        .split(",")
        .filter(Boolean);
    const duration =
        positive(output.format?.duration) ??
        positive(video?.duration) ??
        positive(audio?.duration);
    const metadata: MediaMetadata = { kind: video ? "video" : "audio" };
    if (duration !== undefined) {
        metadata.durationSeconds = Math.round(duration * 1000) / 1000;
    }
    if (video) {
        const turn = rotation(video);
        const width = positive(video.width);
        const height = positive(video.height);
        if (width && height) {
            const sideways = turn === 90 || turn === 270;
            metadata.width = sideways ? height : width;
            metadata.height = sideways ? width : height;
        }
        metadata.rotation = turn;
        const rate =
            frameRate(video.avg_frame_rate) ?? frameRate(video.r_frame_rate);
        if (rate) metadata.frameRate = rate;
        if (video.codec_name) metadata.videoCodec = video.codec_name;
    }
    if (audio) {
        if (audio.codec_name) metadata.audioCodec = audio.codec_name;
        const sampleRate = positive(audio.sample_rate);
        if (sampleRate) metadata.sampleRate = sampleRate;
        const channels = positive(audio.channels);
        if (channels) metadata.channels = channels;
    }
    const bitrate = positive(output.format?.bit_rate);
    if (bitrate) metadata.bitrate = Math.round(bitrate);
    if (formatNames[0]) metadata.format = formatNames[0];

    return {
        metadata,
        details: {
            hasVideo: Boolean(video),
            hasAudio: Boolean(audio),
            codedWidth: positive(video?.width),
            codedHeight: positive(video?.height),
            pixelFormat: video?.pix_fmt,
            videoProfile: video?.profile,
            formatNames,
        },
    };
}

/** Image metadata from the first bytes of the file, without decoding it. */
export async function imageMetadata(
    head: Buffer,
): Promise<MediaMetadata | null> {
    const info = await readImageInfoFromBuffer(head);
    if (!info) return null;
    return {
        kind: "image",
        width: info.width,
        height: info.height,
        format: info.format,
    };
}
