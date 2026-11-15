"use client";

import { useCallback, useEffect, useState } from "react";

type FileText =
    | { status: "loading" }
    | { status: "ready"; text: string }
    | { status: "tooLarge" }
    | { status: "error" };

/* Loads a file's text through the API, which reads it from storage, so
   text viewers work for private files and need no storage CORS. */
export function useFileText(appId: string, mediaId: string) {
    const [state, setState] = useState<FileText>({ status: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setState({ status: "loading" });
        fetch(
            `/api/apps/${encodeURIComponent(appId)}/media/${encodeURIComponent(mediaId)}/content`,
            { signal: controller.signal },
        )
            .then(async (response) => {
                if (response.status === 413) {
                    setState({ status: "tooLarge" });
                    return;
                }
                if (!response.ok) throw new Error("Failed to load file");
                setState({ status: "ready", text: await response.text() });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ status: "error" });
            });
        return () => controller.abort();
    }, [appId, mediaId, attempt]);

    const retry = useCallback(() => setAttempt((value) => value + 1), []);
    return { ...state, retry } as FileText & { retry: () => void };
}
