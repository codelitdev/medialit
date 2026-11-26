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
    SettingsField,
    SettingsFieldset,
    SettingsStack,
    SettingsStatus,
    settingsOptionClass,
} from "@/components/settings-field";
import { updateMediaSettings } from "@/app/actions";
import {
    HLS_RENDITIONS,
    VIDEO_STREAMING_VALUES,
    type HlsRendition,
    type MediaSettings,
    type ProcessingMinutes,
    type VideoStreaming,
} from "@medialit/models";

const STREAMING_LABELS: Record<VideoStreaming, string> = {
    hls: "HLS (adaptive streaming)",
    mp4: "MP4 optimized for the web",
    off: "Off",
};

/** Saves one card's fields. */
function useSave(appId: string) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    async function save(update: Partial<MediaSettings>) {
        setError(null);
        setSaved(false);
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
        <div className="flex flex-wrap items-center gap-3">
            <button
                type="submit"
                className="workspace-button"
                disabled={pending || disabled}
            >
                {pending ? "Saving…" : "Save"}
            </button>
            <SettingsStatus error={error} success={saved && message} />
        </div>
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
        void save({ useWebP, webpOutputQuality: Number(quality) });
    }

    return (
        <SettingsCard
            icon={<ImageIcon aria-hidden="true" />}
            title="Image optimization"
            description="What happens to images when they are sealed. Changes apply to images sealed afterwards."
        >
            <form onSubmit={submit}>
                <SettingsStack>
                    <div className="flex items-center gap-3">
                        <Switch
                            id="use-webp"
                            checked={useWebP}
                            onCheckedChange={(checked) => {
                                edited();
                                setUseWebP(checked);
                            }}
                        />
                        <label
                            htmlFor="use-webp"
                            className={settingsOptionClass}
                        >
                            Convert images to WebP when they are sealed
                        </label>
                    </div>
                    <SettingsField
                        label="WebP quality"
                        htmlFor="webp-quality"
                        hint="1 to 100. 80 suits most images; higher is sharper and larger."
                        hintId="webp-quality-help"
                        className="sm:max-w-sm"
                    >
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
                    </SettingsField>
                    <SaveRow
                        pending={pending}
                        error={error}
                        saved={saved}
                        message="Image settings saved."
                    />
                </SettingsStack>
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
                : [...current, rendition],
        );
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        // Renditions are only sent with HLS, where at least one is required.
        void save(
            streaming === "hls"
                ? { videoStreaming: streaming, hlsRenditions: renditions }
                : { videoStreaming: streaming },
        );
    }

    return (
        <SettingsCard
            icon={<Film aria-hidden="true" />}
            title="Video streaming"
            description="How videos are prepared for playback when they are sealed. The original file is always kept."
        >
            <form onSubmit={submit}>
                <SettingsStack>
                    <SettingsField
                        label="Format"
                        htmlFor="video-streaming"
                        hint={
                            <>
                                Applies to videos sealed after you save.{" "}
                                <a
                                    href="https://medialit.cloud/docs/concepts#video-streaming"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary underline-offset-2 hover:underline"
                                >
                                    About the formats
                                </a>
                            </>
                        }
                        className="sm:max-w-sm"
                    >
                        <Select
                            value={streaming}
                            onValueChange={(value) => {
                                edited();
                                setStreaming(value as VideoStreaming);
                            }}
                        >
                            <SelectTrigger id="video-streaming">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VIDEO_STREAMING_VALUES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {STREAMING_LABELS[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </SettingsField>
                    {streaming === "hls" ? (
                        <SettingsFieldset
                            legend="HLS renditions"
                            hint="Sizes larger than the video are skipped."
                        >
                            <div className="flex flex-wrap gap-x-5 gap-y-2">
                                {HLS_RENDITIONS.map((rendition) => (
                                    <div
                                        key={rendition}
                                        className="flex items-center gap-2"
                                    >
                                        <Checkbox
                                            id={`rendition-${rendition}`}
                                            checked={renditions.includes(
                                                rendition,
                                            )}
                                            onCheckedChange={() =>
                                                toggleRendition(rendition)
                                            }
                                        />
                                        <label
                                            htmlFor={`rendition-${rendition}`}
                                            className={settingsOptionClass}
                                        >
                                            {rendition}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </SettingsFieldset>
                    ) : null}
                    {minutes ? <MinutesUsage minutes={minutes} /> : null}
                    <SaveRow
                        pending={pending}
                        error={error}
                        saved={saved}
                        disabled={
                            streaming === "hls" && renditions.length === 0
                        }
                        message="Video settings saved."
                    />
                </SettingsStack>
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
            <SettingsField label="Video processing this month">
                <span className="text-[13px] text-foreground">
                    {used} {unit(used)} used · no limit
                </span>
            </SettingsField>
        );
    }
    const percent = allowed > 0 ? Math.min(100, (used / allowed) * 100) : 100;
    const left = Math.max(0, allowed - used);
    return (
        <SettingsField
            label={
                <span className="flex items-baseline justify-between gap-3">
                    <span id="minutes-label">Video processing this month</span>
                    <span className="font-normal text-muted-foreground">
                        {used} of {allowed} {unit(allowed)}
                    </span>
                </span>
            }
            hint={
                left > 0
                    ? `${left} ${unit(left)} left. Resets on the 1st (UTC).`
                    : "No minutes left. New videos keep only their original and poster until the 1st (UTC)."
            }
            className="sm:max-w-sm"
        >
            <Progress
                value={percent}
                aria-labelledby="minutes-label"
                aria-valuetext={`${used} of ${allowed} ${unit(allowed)} used`}
                className="h-1.5 bg-muted"
            />
        </SettingsField>
    );
}
