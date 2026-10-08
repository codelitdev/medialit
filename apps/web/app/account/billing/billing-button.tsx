"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { openBillingPortal, startProCheckout } from "./action";

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
    const { toast } = useToast();
    const [pending, setPending] = useState(false);

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
                    toast({
                        title: "Uh oh!",
                        description: result.error || "Billing request failed",
                    });
                }
            }}
        >
            {children}
        </Button>
    );
}
