"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    updateMediaSettings,
    type HlsRendition,
    type MediaSettings,
    type MediaSettingsUpdate,
    type ProcessingMinutes,
    type VideoStreaming,
} from "@/app/actions";

const RENDITIONS: HlsRendition[] = ["1080p", "720p", "480p", "360p"];

const STREAMING_LABELS: Record<VideoStreaming, string> = {
    hls: "HLS (adaptive streaming)",
    mp4: "MP4 optimized for the web",
    off: "Off",
};

/** "default" keeps following the plan; the others are a stored choice. */
type StreamingChoice = VideoStreaming | "default";

export default function MediaSettingsSection({
    appId,
    settings,
    minutes,
}: {
    appId: string;
    settings: MediaSettings;
    minutes: ProcessingMinutes | null;
}) {
    const router = useRouter();
    const [useWebP, setUseWebP] = useState(settings.useWebP);
    const [quality, setQuality] = useState(String(settings.webpOutputQuality));
    const [width, setWidth] = useState(String(settings.thumbnailWidth));
    const [height, setHeight] = useState(String(settings.thumbnailHeight));
    const [streaming, setStreaming] = useState<StreamingChoice>(
        settings.videoStreamingDefault ? "default" : settings.videoStreaming,
    );
    const [renditions, setRenditions] = useState<HlsRendition[]>(
        settings.hlsRenditions,
    );
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const planDefault = settings.videoStreamingDefault
        ? settings.videoStreaming
        : null;
    const effective =
        streaming === "default" ? (planDefault ?? "off") : streaming;

    function toggleRendition(rendition: HlsRendition) {
        setSaved(false);
        setRenditions((current) =>
            current.includes(rendition)
                ? current.filter((item) => item !== rendition)
                : RENDITIONS.filter(
                      (item) => item === rendition || current.includes(item),
                  ),
        );
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setSaved(false);
        // Only what the user changed. The form shows the display defaults
        // for sizes the app never set; saving those would change thumbnails.
        const update: MediaSettingsUpdate = {};
        if (useWebP !== settings.useWebP) update.useWebP = useWebP;
        if (Number(quality) !== settings.webpOutputQuality) {
            update.webpOutputQuality = Number(quality);
        }
        if (
            Number(width) !== settings.thumbnailWidth ||
            Number(height) !== settings.thumbnailHeight
        ) {
            update.thumbnailWidth = Number(width);
            update.thumbnailHeight = Number(height);
        }
        const initialStreaming: StreamingChoice = settings.videoStreamingDefault
            ? "default"
            : settings.videoStreaming;
        if (streaming !== initialStreaming) {
            update.videoStreaming = streaming === "default" ? null : streaming;
        }
        if (renditions.join(",") !== settings.hlsRenditions.join(",")) {
            update.hlsRenditions = renditions;
        }
        if (Object.keys(update).length === 0) {
            setSaved(true);
            return;
        }
        setPending(true);
        const result = await updateMediaSettings(appId, update);
        setPending(false);
        if (!result.success) {
            setError(result.error);
            return;
        }
        setSaved(true);
        router.refresh();
    }

    return (
        <form onSubmit={submit} className="grid gap-5">
            <fieldset className="settings-field">
                <legend className="text-sm font-medium">Images</legend>
                <label className="flex items-center gap-2 text-sm font-normal">
                    <input
                        type="checkbox"
                        checked={useWebP}
                        onChange={(event) => {
                            setSaved(false);
                            setUseWebP(event.target.checked);
                        }}
                    />
                    Convert images to WebP when they are sealed
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="settings-field">
                        <label htmlFor="webp-quality">WebP quality</label>
                        <input
                            id="webp-quality"
                            className="settings-input"
                            type="number"
                            min={0}
                            max={100}
                            required
                            value={quality}
                            disabled={!useWebP}
                            onChange={(event) => {
                                setSaved(false);
                                setQuality(event.target.value);
                            }}
                        />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="thumbnail-width">
                            Thumbnail width (px)
                        </label>
                        <input
                            id="thumbnail-width"
                            className="settings-input"
                            type="number"
                            min={1}
                            required
                            value={width}
                            onChange={(event) => {
                                setSaved(false);
                                setWidth(event.target.value);
                            }}
                        />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="thumbnail-height">
                            Thumbnail height (px)
                        </label>
                        <input
                            id="thumbnail-height"
                            className="settings-input"
                            type="number"
                            min={1}
                            required
                            value={height}
                            onChange={(event) => {
                                setSaved(false);
                                setHeight(event.target.value);
                            }}
                        />
                    </div>
                </div>
            </fieldset>

            <fieldset className="settings-field">
                <legend className="text-sm font-medium">Videos</legend>
                <div className="settings-field">
                    <label htmlFor="video-streaming">Video streaming</label>
                    <select
                        id="video-streaming"
                        className="settings-input"
                        value={streaming}
                        onChange={(event) => {
                            setSaved(false);
                            setStreaming(event.target.value as StreamingChoice);
                        }}
                    >
                        <option value="default">
                            Your plan’s default
                            {planDefault
                                ? ` (${STREAMING_LABELS[planDefault]})`
                                : ""}
                        </option>
                        {(["hls", "mp4", "off"] as VideoStreaming[]).map(
                            (value) => (
                                <option key={value} value={value}>
                                    {STREAMING_LABELS[value]}
                                </option>
                            ),
                        )}
                    </select>
                    <p className="settings-subtle text-sm">
                        Applies to videos sealed after you save. The original
                        file is always kept.
                    </p>
                </div>
                {effective === "hls" ? (
                    <fieldset className="settings-field">
                        <legend className="text-sm">HLS renditions</legend>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {RENDITIONS.map((rendition) => (
                                <label
                                    key={rendition}
                                    className="flex items-center gap-2 text-sm font-normal"
                                >
                                    <input
                                        type="checkbox"
                                        checked={renditions.includes(rendition)}
                                        onChange={() =>
                                            toggleRendition(rendition)
                                        }
                                    />
                                    {rendition}
                                </label>
                            ))}
                        </div>
                        <p className="settings-subtle text-sm">
                            Sizes larger than the video are skipped.
                        </p>
                    </fieldset>
                ) : null}
                {minutes ? (
                    <p className="settings-subtle text-sm" role="status">
                        Video processing this month: {minutes.used}{" "}
                        {minutes.allowed === null
                            ? "minutes (no limit)"
                            : `of ${minutes.allowed} minutes`}
                    </p>
                ) : null}
            </fieldset>

            {error ? (
                <p className="inline-error" role="alert">
                    {error}
                </p>
            ) : null}
            {saved ? (
                <p className="inline-feedback" role="status">
                    Media settings saved.
                </p>
            ) : null}
            <div>
                <button
                    type="submit"
                    className="workspace-button"
                    disabled={
                        pending ||
                        (effective === "hls" && renditions.length === 0)
                    }
                >
                    {pending ? "Saving…" : "Save"}
                </button>
            </div>
        </form>
    );
}
