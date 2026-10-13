"use client";

import { useEffect, useState } from "react";

/* Fetches the playable/downloadable URL for a media item. Private files get a
   signed URL from the API, so this runs when the details dialog opens. */
export function useFileUrl(keyid: string, mediaId: string) {
    const [state, setState] = useState({ url: "", error: false });

    useEffect(() => {
        let active = true;
        setState({ url: "", error: false });
        fetch(
            `/api/apps/${encodeURIComponent(keyid)}/media/${encodeURIComponent(mediaId)}`,
        )
            .then(async (response) => {
                if (!response.ok) throw new Error("Failed to load file");
                const media = await response.json();
                if (!media?.file) throw new Error("No file URL");
                if (active) setState({ url: media.file, error: false });
            })
            .catch(() => {
                if (active) setState({ url: "", error: true });
            });
        return () => {
            active = false;
        };
    }, [keyid, mediaId]);

    return state;
}
