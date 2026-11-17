"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { MediaListItem, MediaPreview } from "@/lib/media";
import { ViewerLoading } from "./viewer-states";

export type ViewerProps = {
    media: MediaListItem;
    appId: string;
};

export type NativeViewer = {
    /** Shown to people, e.g. on the expand button. */
    label: string;
    /** Opens straight into the full-screen reading view on phones. */
    fullScreenOnMobile: boolean;
    Component: ComponentType<ViewerProps>;
};

/* Native viewers by the name the API gives a file's `preview`. To add one,
   teach the API's mediaPreview() the new name and register its viewer here.
   Each viewer loads on demand so its libraries stay out of the files page. */
const viewers: Record<MediaPreview, NativeViewer> = {
    markdown: {
        label: "Markdown",
        fullScreenOnMobile: true,
        Component: dynamic(() => import("./markdown-viewer"), {
            ssr: false,
            loading: () => <ViewerLoading />,
        }),
    },
};

export function nativeViewerFor(media: MediaListItem): NativeViewer | null {
    return media.preview ? (viewers[media.preview] ?? null) : null;
}
