"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { openBillingPortal, startProCheckout } from "./action";
import { toast } from "sonner";

/** Starts a provider checkout or opens the provider's billing portal. */
export default function BillingButton({
    mode,
    interval,
    className,
    children,
}: {
    mode: "checkout" | "portal";
    interval?: "month" | "year";
    className?: string;
    children: React.ReactNode;
}) {
    const [pending, setPending] = useState(false);

    // Pressing back from the provider's page can restore this page from the
    // browser's back-forward cache with the button still disabled.
    useEffect(() => {
        const reset = (event: PageTransitionEvent) => {
            if (event.persisted) setPending(false);
        };
        window.addEventListener("pageshow", reset);
        return () => window.removeEventListener("pageshow", reset);
    }, []);

    return (
        <Button
            className={className}
            disabled={pending}
            onClick={async () => {
                setPending(true);
                const result =
                    mode === "portal"
                        ? await openBillingPortal()
                        : await startProCheckout(interval ?? "month");
                if (result.url) {
                    window.location.href = result.url;
                    return;
                }
                if (result.signInUrl) {
                    window.location.assign(result.signInUrl);
                    return;
                }
                setPending(false);
                if (!result.success) {
                    toast.error("Uh oh!", {
                        description: result.error || "Billing request failed",
                    });
                }
            }}
        >
            {children}
        </Button>
    );
}
