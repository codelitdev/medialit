"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Film, ImageIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
            <form onSubmit={submit} className="grid gap-5">
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
    const [streaming, setStreaming] = useState<VideoStreaming>(
        settings.videoStreaming,
    );
    const [renditions, setRenditions] = useState<HlsRendition[]>(
        settings.hlsRenditions,
    );
    const { pending, error, saved, save, edited } = useSave(appId);

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
        if (streaming !== settings.videoStreaming) {
            update.videoStreaming = streaming;
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
            <form onSubmit={submit} className="grid gap-5">
                <div className="settings-field">
                    <label htmlFor="video-streaming">Format</label>
                    <Select
                        value={streaming}
                        onValueChange={(value) => {
                            edited();
                            setStreaming(value as VideoStreaming);
                        }}
                    >
                        <SelectTrigger
                            id="video-streaming"
                            className="sm:max-w-xs"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(["off", "hls", "mp4"] as VideoStreaming[]).map(
                                (value) => (
                                    <SelectItem key={value} value={value}>
                                        {STREAMING_LABELS[value]}
                                    </SelectItem>
                                ),
                            )}
                        </SelectContent>
                    </Select>
                    <p className="settings-subtle text-sm">
                        Applies to videos sealed after you save.{" "}
                        <a
                            href="https://medialit.cloud/docs/concepts#video-streaming"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-2 hover:underline"
                        >
                            About the formats
                        </a>
                    </p>
                </div>
                {streaming === "hls" ? (
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
                {minutes ? <MinutesUsage minutes={minutes} /> : null}
                <SaveRow
                    pending={pending}
                    error={error}
                    saved={saved}
                    disabled={streaming === "hls" && renditions.length === 0}
                    message="Video settings saved."
                />
            </form>
        </SettingsCard>
    );
}

/** This month's video processing minutes: a bar against the plan's
 * allowance, or just the count where there is no limit (self-hosted). */
function MinutesUsage({ minutes }: { minutes: ProcessingMinutes }) {
    const { used, allowed } = minutes;
    const unit = (n: number) => (n === 1 ? "minute" : "minutes");
    if (allowed === null) {
        return (
            <div className="grid gap-1 text-[13px]">
                <span className="font-semibold">
                    Video processing this month
                </span>
                <span className="text-muted-foreground">
                    {used} {unit(used)} used · no limit
                </span>
            </div>
        );
    }
    const percent = allowed > 0 ? Math.min(100, (used / allowed) * 100) : 100;
    const left = Math.max(0, allowed - used);
    return (
        <div className="grid gap-2 sm:max-w-xs">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span id="minutes-label" className="font-semibold">
                    Video processing this month
                </span>
                <span className="text-muted-foreground">
                    {used} of {allowed}
                </span>
            </div>
            <Progress
                value={percent}
                aria-labelledby="minutes-label"
                aria-valuetext={`${used} of ${allowed} ${unit(allowed)} used`}
                className="h-1.5 bg-muted"
            />
            <span className="text-[11px] text-muted-foreground">
                {left > 0
                    ? `${left} ${unit(left)} left. Resets on the 1st (UTC).`
                    : "No minutes left. New videos keep only their original and poster until the 1st (UTC)."}
            </span>
        </div>
    );
}
