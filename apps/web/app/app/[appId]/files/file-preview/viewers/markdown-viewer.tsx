"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ViewerProps } from ".";
import { useFileText } from "./use-file-text";
import { ViewerLoading, ViewerMessage } from "./viewer-states";

/* Raw HTML in the file is shown as text, never run, and react-markdown drops
   unsafe link schemes. Links leave the dashboard in a new tab. */
const components: Components = {
    a: ({ node: _node, ...props }) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
    img: ({ node: _node, alt, ...props }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img {...props} alt={alt ?? ""} loading="lazy" />
    ),
    table: ({ node: _node, ...props }) => (
        <div className="overflow-x-auto">
            <table {...props} />
        </div>
    ),
};

export default function MarkdownViewer({ media, appId }: ViewerProps) {
    const file = useFileText(appId, media.mediaId);

    if (file.status === "loading") return <ViewerLoading />;
    if (file.status === "tooLarge") {
        return (
            <ViewerMessage
                title="Too large to preview"
                description="Files over 2 MB can’t be shown here. Copy the link to open it instead."
            />
        );
    }
    if (file.status === "error") {
        return (
            <ViewerMessage
                title="Couldn’t load this file"
                onRetry={file.retry}
            />
        );
    }
    if (!file.text.trim()) {
        return <ViewerMessage title="This file is empty" />;
    }

    return (
        <div
            className="absolute inset-0 overflow-y-auto overscroll-contain bg-card"
            tabIndex={0}
            aria-label={`Contents of ${media.originalFileName}`}
        >
            <article className="prose prose-sm mx-auto max-w-[72ch] break-words px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:prose-base sm:px-10 sm:pt-10">
                <Markdown remarkPlugins={[remarkGfm]} components={components}>
                    {file.text}
                </Markdown>
            </article>
        </div>
    );
}
