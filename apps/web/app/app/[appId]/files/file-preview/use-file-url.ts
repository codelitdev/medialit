"use client";

import { useEffect, useState } from "react";

import type { PlayableMedia } from "@medialit/react";

type FileState = {
    /** The file, its thumbnail and derivatives (HLS and the web MP4 when the
     * app makes them). `file` is a signed URL for private media. */
    media?: PlayableMedia;
    error: boolean;
};

/* Fetches the playable/downloadable URL for a media item. Private files get a
   signed URL from the API, so this runs when the details dialog opens. */
export function useFileUrl(appId: string, mediaId: string) {
    const [state, setState] = useState<FileState>({ error: false });

    useEffect(() => {
        let active = true;
        setState({ error: false });
        fetch(
            `/api/apps/${encodeURIComponent(appId)}/media/${encodeURIComponent(mediaId)}`,
        )
            .then(async (response) => {
                if (!response.ok) throw new Error("Failed to load file");
                const media = await response.json();
                if (!media?.file) throw new Error("No file URL");
                if (active) {
                    setState({
                        error: false,
                        media: {
                            file: media.file,
                            thumbnail: media.thumbnail || undefined,
                            derivatives: media.derivatives,
                        },
                    });
                }
            })
            .catch(() => {
                if (active) setState({ error: true });
            });
        return () => {
            active = false;
        };
    }, [appId, mediaId]);

    return state;
}
