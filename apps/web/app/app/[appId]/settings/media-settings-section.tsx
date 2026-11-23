"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Film, ImageIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { SettingsCard } from "@/components/settings-card";
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

/** Saves one card's changes. Each card sends only its own fields, and only
 * those the user changed. */
function useSave(appId: string) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    async function save(update: MediaSettingsUpdate) {
        setError(null);
        setSaved(false);
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

    return { pending, error, saved, save, edited: () => setSaved(false) };
}

function SaveRow({
    pending,
    error,
    saved,
    disabled = false,
    message,
}: {
    pending: boolean;
    error: string | null;
    saved: boolean;
    disabled?: boolean;
    message: string;
}) {
    return (
        <>
            {error ? (
                <p className="inline-error" role="alert">
                    {error}
                </p>
            ) : null}
            {saved ? (
                <p className="inline-feedback" role="status">
                    {message}
                </p>
            ) : null}
            <div>
                <button
                    type="submit"
                    className="workspace-button"
                    disabled={pending || disabled}
                >
                    {pending ? "Saving…" : "Save"}
                </button>
            </div>
        </>
    );
}

export function ImageOptimizationCard({
    appId,
    settings,
}: {
    appId: string;
    settings: MediaSettings;
}) {
    const [useWebP, setUseWebP] = useState(settings.useWebP);
    const [quality, setQuality] = useState(String(settings.webpOutputQuality));
    const { pending, error, saved, save, edited } = useSave(appId);

    function submit(event: FormEvent) {
        event.preventDefault();
        const update: MediaSettingsUpdate = {};
        if (useWebP !== settings.useWebP) update.useWebP = useWebP;
        if (Number(quality) !== settings.webpOutputQuality) {
            update.webpOutputQuality = Number(quality);
        }
        void save(update);
    }

    return (
        <SettingsCard
            icon={<ImageIcon aria-hidden="true" />}
            title="Image optimization"
            description="What happens to images when they are sealed. Changes apply to images sealed afterwards."
        >
            <form onSubmit={submit} className="mt-4 grid gap-5">
                <div className="flex items-center gap-3">
                    <Switch
                        id="use-webp"
                        checked={useWebP}
                        onCheckedChange={(checked) => {
                            edited();
                            setUseWebP(checked);
                        }}
                    />
                    <label htmlFor="use-webp" className="text-sm font-normal">
                        Convert images to WebP when they are sealed
                    </label>
                </div>
                <div className="settings-field sm:max-w-xs">
                    <label htmlFor="webp-quality">WebP quality</label>
                    <input
                        id="webp-quality"
                        className="settings-input"
                        type="number"
                        min={1}
                        max={100}
                        required
                        value={quality}
                        disabled={!useWebP}
                        aria-describedby="webp-quality-help"
                        onChange={(event) => {
                            edited();
                            setQuality(event.target.value);
                        }}
                    />
                    <p id="webp-quality-help" className="settings-subtle">
                        1 to 100. 80 suits most images; higher is sharper and
                        larger.
                    </p>
                </div>
                <SaveRow
                    pending={pending}
                    error={error}
                    saved={saved}
                    message="Image settings saved."
                />
            </form>
        </SettingsCard>
    );
}

export function VideoStreamingCard({
    appId,
    settings,
    minutes,
}: {
    appId: string;
    settings: MediaSettings;
    minutes: ProcessingMinutes | null;
}) {
    const initialStreaming: StreamingChoice = settings.videoStreamingDefault
        ? "default"
        : settings.videoStreaming;
    const [streaming, setStreaming] =
        useState<StreamingChoice>(initialStreaming);
    const [renditions, setRenditions] = useState<HlsRendition[]>(
        settings.hlsRenditions,
    );
    const { pending, error, saved, save, edited } = useSave(appId);

    const planDefault = settings.videoStreamingDefault
        ? settings.videoStreaming
        : null;
    const effective =
        streaming === "default" ? (planDefault ?? "off") : streaming;

    function toggleRendition(rendition: HlsRendition) {
        edited();
        setRenditions((current) =>
            current.includes(rendition)
                ? current.filter((item) => item !== rendition)
                : RENDITIONS.filter(
                      (item) => item === rendition || current.includes(item),
                  ),
        );
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        const update: MediaSettingsUpdate = {};
        if (streaming !== initialStreaming) {
            update.videoStreaming = streaming === "default" ? null : streaming;
        }
        if (renditions.join(",") !== settings.hlsRenditions.join(",")) {
            update.hlsRenditions = renditions;
        }
        void save(update);
    }

    return (
        <SettingsCard
            icon={<Film aria-hidden="true" />}
            title="Video streaming"
            description="How videos are prepared for playback when they are sealed. The original file is always kept."
        >
            <form onSubmit={submit} className="mt-4 grid gap-5">
                <div className="settings-field">
                    <label htmlFor="video-streaming">Format</label>
                    <select
                        id="video-streaming"
                        className="settings-input"
                        value={streaming}
                        onChange={(event) => {
                            edited();
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
                        Applies to videos sealed after you save.
                    </p>
                </div>
                {effective === "hls" ? (
                    <fieldset className="settings-field">
                        <legend className="text-sm">HLS renditions</legend>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {RENDITIONS.map((rendition) => (
                                <div
                                    key={rendition}
                                    className="flex items-center gap-2"
                                >
                                    <Checkbox
                                        id={`rendition-${rendition}`}
                                        checked={renditions.includes(rendition)}
                                        onCheckedChange={() =>
                                            toggleRendition(rendition)
                                        }
                                    />
                                    <label
                                        htmlFor={`rendition-${rendition}`}
                                        className="text-sm font-normal"
                                    >
                                        {rendition}
                                    </label>
                                </div>
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
                <SaveRow
                    pending={pending}
                    error={error}
                    saved={saved}
                    disabled={effective === "hls" && renditions.length === 0}
                    message="Video settings saved."
                />
            </form>
        </SettingsCard>
    );
}
