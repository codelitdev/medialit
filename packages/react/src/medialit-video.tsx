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
    const { hls: hlsUrl, fallback } = videoSources(media);

    useEffect(() => {
        const video = ref.current;
        if (!video) return;
        let hls: HlsInstance | undefined;
        let cancelled = false;
        if (
            hlsUrl &&
            video.canPlayType("application/vnd.apple.mpegurl") !== ""
        ) {
            setSrc(hlsUrl);
        } else if (hlsUrl) {
            setSrc(undefined);
            import("hls.js")
                .then(({ default: Hls }) => {
                    if (cancelled) return;
                    if (!Hls.isSupported()) {
                        setSrc(fallback);
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
            poster={poster ?? media.thumbnail}
            controls={controls}
            playsInline={playsInline}
            preload={preload}
            {...props}
        />
    );
}
