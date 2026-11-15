"use client";

import { useEffect } from "react";

/* Registers the offline-page service worker in production builds. In dev it
   would cache stale pages across hot reloads, so it is left out there. */
export default function ServiceWorker() {
    useEffect(() => {
        if (
            process.env.NODE_ENV !== "production" ||
            !("serviceWorker" in navigator)
        ) {
            return;
        }
        navigator.serviceWorker
            .register("/sw.js", { scope: "/", updateViaCache: "none" })
            .catch(() => {
                // The app works the same without it; only the offline page is lost.
            });
    }, []);
    return null;
}
