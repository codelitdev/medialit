import {
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ForwardedRef,
    type VideoHTMLAttributes,
} from "react";

type PlayableDerivative = { status: string; url?: string; language?: string };

/** The parts of a MediaLit media response the player reads. */
export interface PlayableMedia {
    file?: string;
    thumbnail?: string;
    derivatives?: Record<string, PlayableDerivative | undefined>;
}

function ready(derivative?: PlayableDerivative) {
    return derivative?.status === "ready" ? derivative.url : undefined;
}

/** The captions track to show, once `derivatives.captions` is ready. The
 * label is the language's name in the viewer's language, where the browser
 * knows it. */
export function captionsTrack(
    media: PlayableMedia,
    locale?: string,
): { src: string; srcLang?: string; label: string } | undefined {
    const captions = media.derivatives?.captions;
    const src = ready(captions);
    if (!src) return undefined;
    const language = captions?.language;
    let label = language ?? "Captions";
    if (language) {
        try {
            label =
                new Intl.DisplayNames(locale ? [locale] : undefined, {
                    type: "language",
                }).of(language) ?? language;
        } catch {
            // An unknown code: show it as it is.
        }
    }
    return { src, srcLang: language, label };
}

/** Sets a ref the caller passed, whichever kind it is. */
function assignRef<T>(ref: ForwardedRef<T> | undefined, value: T | null) {
    if (typeof ref === "function") ref(value);
    else if (ref) ref.current = value;
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
 * poster is the media's thumbnail. Captions, when ready, are a `<track>`
 * whatever plays. Other `<video>` props pass through, and a `ref` gets the
 * `<video>` element, to read `currentTime` or seek.
 */
export const MediaLitVideo = forwardRef(function MediaLitVideo(
    {
        media,
        poster,
        controls = true,
        playsInline = true,
        preload = "metadata",
        onError,
        crossOrigin,
        children,
        ...props
    }: MediaLitVideoProps,
    forwardedRef: ForwardedRef<HTMLVideoElement>,
) {
    const ref = useRef<HTMLVideoElement | null>(null);
    const setRef = useCallback(
        (element: HTMLVideoElement | null) => {
            ref.current = element;
            assignRef(forwardedRef, element);
        },
        [forwardedRef],
    );
    const track = captionsTrack(media);
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
            {...props}
            ref={setRef}
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
            // The captions file is on storage's origin: a <track> from
            // another origin loads only in CORS mode.
            crossOrigin={crossOrigin ?? (track ? "anonymous" : undefined)}
        >
            {track ? (
                <track
                    kind="captions"
                    src={track.src}
                    srcLang={track.srcLang}
                    label={track.label}
                />
            ) : null}
            {children}
        </video>
    );
});
