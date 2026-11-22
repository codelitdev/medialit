import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";

/** The parts of a MediaLit media response the player reads. */
export interface PlayableMedia {
    file?: string;
    thumbnail?: string;
    derivatives?: Record<string, { status: string; url?: string } | undefined>;
}

export type VideoSource =
    | { kind: "hls"; url: string }
    | { kind: "mp4"; url: string }
    | { kind: "file"; url: string };

/**
 * What to play, best first: HLS when it is ready, then the MP4 optimized
 * for the web, then the original file.
 */
export function videoSources(media: PlayableMedia): VideoSource[] {
    const sources: VideoSource[] = [];
    const hls = media.derivatives?.hls;
    if (hls?.status === "ready" && hls.url) {
        sources.push({ kind: "hls", url: hls.url });
    }
    const mp4 = media.derivatives?.mp4;
    if (mp4?.status === "ready" && mp4.url) {
        sources.push({ kind: "mp4", url: mp4.url });
    }
    if (media.file) sources.push({ kind: "file", url: media.file });
    return sources;
}

export interface MediaLitVideoProps
    extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> {
    media: PlayableMedia;
}

type HlsInstance = { destroy(): void };

/**
 * Plays a MediaLit video: HLS when ready (natively in Safari and iOS, with
 * hls.js elsewhere, loaded only when needed), otherwise the web MP4 or the
 * original. The poster is the media's thumbnail. Other `<video>` props pass
 * through.
 */
export function MediaLitVideo({
    media,
    poster,
    controls = true,
    playsInline = true,
    preload = "metadata",
    ...props
}: MediaLitVideoProps) {
    const ref = useRef<HTMLVideoElement>(null);
    const [src, setSrc] = useState<string | undefined>(undefined);
    const sources = videoSources(media);
    const key = sources.map((s) => s.url).join(" ");

    useEffect(() => {
        const video = ref.current;
        if (!video) return;
        let hls: HlsInstance | undefined;
        let cancelled = false;
        const fallback = sources.find((s) => s.kind !== "hls");
        const hlsSource = sources.find((s) => s.kind === "hls");

        if (
            hlsSource &&
            video.canPlayType("application/vnd.apple.mpegurl") !== ""
        ) {
            setSrc(hlsSource.url);
        } else if (hlsSource) {
            setSrc(undefined);
            import("hls.js")
                .then(({ default: Hls }) => {
                    if (cancelled) return;
                    if (!Hls.isSupported()) {
                        setSrc(fallback?.url);
                        return;
                    }
                    const instance = new Hls();
                    hls = instance;
                    instance.on(Hls.Events.ERROR, (_event, data) => {
                        // A fatal error with a file to fall back to: play it.
                        if (data.fatal && fallback) {
                            instance.destroy();
                            hls = undefined;
                            setSrc(fallback.url);
                        }
                    });
                    instance.loadSource(hlsSource.url);
                    instance.attachMedia(video);
                })
                .catch(() => {
                    if (!cancelled) setSrc(fallback?.url);
                });
        } else {
            setSrc(fallback?.url);
        }

        return () => {
            cancelled = true;
            hls?.destroy();
        };
        // `key` changes exactly when the sources do.
    }, [key]);

    return (
        <video
            ref={ref}
            src={src}
            poster={poster ?? media.thumbnail}
            controls={controls}
            playsInline={playsInline}
            preload={preload}
            {...props}
        />
    );
}
