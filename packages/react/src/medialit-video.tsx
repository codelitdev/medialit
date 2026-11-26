import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";

/** The parts of a MediaLit media response the player reads. */
export interface PlayableMedia {
    file?: string;
    thumbnail?: string;
    derivatives?: Record<string, { status: string; url?: string } | undefined>;
}

function ready(derivative?: { status: string; url?: string }) {
    return derivative?.status === "ready" ? derivative.url : undefined;
}

/**
 * What to play: HLS when it is ready, and a fallback for browsers that
 * can't play it — the MP4 optimized for the web, else the original file.
 */
export function videoSources(media: PlayableMedia): {
    hls?: string;
    fallback?: string;
} {
    return {
        hls: ready(media.derivatives?.hls),
        fallback: ready(media.derivatives?.mp4) ?? media.file,
    };
}

/**
 * How to play HLS: hls.js wherever the browser has Media Source Extensions,
 * which is every desktop browser, and native playback only without them
 * (Safari on iPhone). Desktop Chrome and Edge report native HLS support too,
 * but on some platforms it fails without an error, so it isn't trusted when
 * hls.js can run.
 */
export function hlsPlayback(browser: {
    mediaSource: boolean;
    nativeHls: boolean;
}): "hls.js" | "native" | "none" {
    if (browser.mediaSource) return "hls.js";
    if (browser.nativeHls) return "native";
    return "none";
}

export interface MediaLitVideoProps
    extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> {
    media: PlayableMedia;
}

type HlsInstance = { destroy(): void };

/**
 * Plays a MediaLit video: HLS when ready (with hls.js, loaded only when
 * needed, or natively on iPhone), otherwise the web MP4 or the original.
 * If HLS fails to play, it switches to the web MP4 or the original. The
 * poster is the media's thumbnail. Other `<video>` props pass through.
 */
export function MediaLitVideo({
    media,
    poster,
    controls = true,
    playsInline = true,
    preload = "metadata",
    onError,
    ...props
}: MediaLitVideoProps) {
    const ref = useRef<HTMLVideoElement>(null);
    const [src, setSrc] = useState<string | undefined>(undefined);
    const { hls: hlsUrl, fallback } = videoSources(media);

    useEffect(() => {
        const video = ref.current;
        if (!video) return;
        let hls: HlsInstance | undefined;
        let cancelled = false;
        const nativeHls =
            video.canPlayType("application/vnd.apple.mpegurl") !== "";
        const playback = hlsUrl
            ? hlsPlayback({
                  mediaSource:
                      typeof window !== "undefined" && "MediaSource" in window,
                  nativeHls,
              })
            : "none";
        if (playback === "native") {
            setSrc(hlsUrl);
        } else if (playback === "hls.js" && hlsUrl) {
            setSrc(undefined);
            import("hls.js")
                .then(({ default: Hls }) => {
                    if (cancelled) return;
                    if (!Hls.isSupported()) {
                        setSrc(nativeHls ? hlsUrl : fallback);
                        return;
                    }
                    const instance = new Hls();
                    hls = instance;
                    instance.on(Hls.Events.ERROR, (_event, data) => {
                        // A fatal error with a file to fall back to: play it.
                        if (data.fatal && fallback) {
                            instance.destroy();
                            hls = undefined;
                            setSrc(fallback);
                        }
                    });
                    instance.loadSource(hlsUrl);
                    instance.attachMedia(video);
                })
                .catch(() => {
                    if (!cancelled) setSrc(fallback);
                });
        } else {
            setSrc(fallback);
        }

        return () => {
            cancelled = true;
            hls?.destroy();
        };
    }, [hlsUrl, fallback]);

    return (
        <video
            ref={ref}
            src={src}
            onError={(event) => {
                // Native HLS that won't play: switch to the file that will.
                if (src && src === hlsUrl && fallback) setSrc(fallback);
                onError?.(event);
            }}
            poster={poster ?? media.thumbnail}
            controls={controls}
            playsInline={playsInline}
            preload={preload}
            {...props}
        />
    );
}
