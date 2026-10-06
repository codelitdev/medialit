"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export default function Scripts() {
    const [crisp, setCrisp] = useState<string | null>(null);

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
            const observability = createBrowserObservability({
                serviceName: "medialit-web",
                environment: result.environment || "production",
                apiKey: result.posthog,
                host: result.posthogHost,
            });
            await observability.init();
        }
        load().catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

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
