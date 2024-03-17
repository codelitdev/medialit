"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { useRouter } from "next/navigation";
import { Session } from "next-auth";
import { useToast } from "../../../components/ui/use-toast";

export default function LemonSqueezyStartSubscriptionButton({
    session,
    storeId,
    productId,
    userId,
    children,
    currentPlan,
    subscriptionStatus,
    className,
}: {
    session: Session | null;
    storeId: string;
    productId: string;
    userId: string;
    children: ReactNode;
    currentPlan?: string;
    subscriptionStatus: string;
    className?: string;
}) {
    const router = useRouter();
    const [events, setEvents] = useState<any[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        // Make sure Lemon.js is loaded
        function setupLemonSqueezy() {
            if (typeof (window as any).createLemonSqueezy !== "undefined") {
                (window as any).createLemonSqueezy();
                (window as any).LemonSqueezy.Setup({
                    eventHandler: (event: any) => {
                        if (event === "close") {
                            setEvents([...events, "close"]);
                        }
                        if (event.event === "Checkout.Success") {
                            setEvents([...events, "checkout"]);
                        }
                    },
                });
            }
        }

        setupLemonSqueezy();
    }, [events]);

    useEffect(() => {
        function showThankYou() {
            if (
                events.length === 2 &&
                events[0] === "checkout" &&
                events[1] === "close"
            ) {
                toast({
                    title: "Subscribed",
                    description: "Thank you for your purchase! Keep creating.",
                });
                router.refresh();
            }
        }

        showThankYou();
    }, [events]);

    return (
        <a
            onClick={() => {
                if (!storeId || !productId) {
                    return;
                }

                if (!session) {
                    router.push("/login");
                } else {
                    const url = `https://${storeId}.lemonsqueezy.com/checkout/buy/${productId}?checkout[email]=${session.user?.email}&checkout[custom][subscriberId]=${userId}&embed=1`;
                    (window as any).LemonSqueezy.Url.Open(url);
                }
            }}
            className={`w-full lemonsqueezy-button ${
                currentPlan === "Basic" &&
                subscriptionStatus === "not-subscribed"
                    ? "pointer-events-none"
                    : ""
            }`}
        >
            <Button
                className={`justify-center w-full ${className}`}
                disabled={
                    (currentPlan === "Basic" &&
                        subscriptionStatus === "not-subscribed") ||
                    !storeId ||
                    !productId
                }
            >
                {children}
            </Button>
        </a>
    );
}
