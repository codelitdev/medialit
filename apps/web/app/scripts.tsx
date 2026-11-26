"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BrowserObservability } from "@codelitdev/observability/browser";

/* App pages live at /app/<public app ID>/…, the ID the API sends events
   for as the `app` group. */
function appIdFromPath(pathname: string | null): string | null {
    const match = pathname?.match(/^\/app\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export default function Scripts({ userId }: { userId: string | null }) {
    const [crisp, setCrisp] = useState<string | null>(null);
    const [observability, setObservability] =
        useState<BrowserObservability | null>(null);
    const identified = useRef<string | null>(null);
    const pathname = usePathname();

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const response = await fetch("/config");
            const result = await response.json();
            if (cancelled) return;
            if (result.crisp) setCrisp(String(result.crisp));
            if (!result.posthog) return;
            const { createBrowserObservability } = await import(
                "@codelitdev/observability/browser"
            );
            const instance = createBrowserObservability({
                serviceName: "medialit-web",
                environment: result.environment || "production",
                apiKey: result.posthog,
                host: result.posthogHost,
            });
            await instance.init();
            if (!cancelled) setObservability(instance);
        }
        load().catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    /* The same user ID the API sends events under, and nothing else: no
       email or name. Signing out resets, so the next person starts fresh. */
    useEffect(() => {
        if (!observability) return;
        if (userId && identified.current !== userId) {
            observability.identify({ id: userId });
            identified.current = userId;
        } else if (!userId && identified.current) {
            observability.reset();
            identified.current = null;
        }
    }, [observability, userId]);

    const appId = userId ? appIdFromPath(pathname) : null;
    useEffect(() => {
        if (observability && appId) observability.group("app", appId);
    }, [observability, appId]);

    if (!crisp) {
        return null;
    }

    return (
        <Script strategy="lazyOnload" id="crisp-chat">
            {`
                    window.$crisp=[];window.CRISP_WEBSITE_ID="${crisp}";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
                    `}
        </Script>
    );
}
