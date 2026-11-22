"use client";

import { useEffect } from "react";

/* The settings page streams in behind a loading state, so the browser looks
   for `#webhooks` before the section exists. Scroll once it has rendered. */
export default function ScrollToHash() {
    useEffect(() => {
        const id = decodeURIComponent(window.location.hash.slice(1));
        if (id) document.getElementById(id)?.scrollIntoView();
    }, []);
    return null;
}
