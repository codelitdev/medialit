"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { resumeSubscription } from "./action";
import { useToast } from "@/components/ui/use-toast";
import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";

export default function ResumeSubscriptionButton({
    expiresAt,
    currentPlan,
    subscriptionStatus,
    className,
}: {
    expiresAt?: Date;
    currentPlan: string;
    subscriptionStatus: string;
    className?: string;
}) {
    const [formState, formAction] = useActionState(resumeSubscription, {
        success: false,
    });
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        if (formState.success) {
            toast({
                title: "Welcome back!",
                description: "Your subscription has been resumed",
            });
            router.refresh();
        }
        if (formState.error) {
            toast({
                title: "Uh oh!",
                description: formState.error,
            });
        }
    }, [formState]);

    return (
        <form action={formAction}>
            <Submit
                currentPlan={currentPlan}
                subscriptionStatus={subscriptionStatus}
                className={className}
            >
                Resume subscription
            </Submit>

            {currentPlan !== "Basic" &&
                subscriptionStatus === "cancelled" &&
                expiresAt && (
                    <p
                        className="text-center text-sm text-slate-500"
                        suppressHydrationWarning={true}
                    >
                        Expires at{" "}
                        {new Date(expiresAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}
                    </p>
                )}
        </form>
    );
}

function Submit({
    children,
    currentPlan,
    subscriptionStatus,
    className,
}: {
    children: React.ReactNode;
    currentPlan: string;
    subscriptionStatus: string;
    className?: string;
}) {
    const status = useFormStatus();
    let buttonText = children;

    if (currentPlan === "Basic" && subscriptionStatus === "cancelled") {
        buttonText = "Current plan";
        className =
            "pointer-events-none w-full mb-5 bg-white hover:bg-white !text-muted-foreground border border-muted-foreground";
    }

    return (
        <Button
            className={`bg-red-500 hover:bg-red-700 w-full text-white mb-1 ${className}`}
            type="submit"
            variant="secondary"
            disabled={status.pending}
        >
            {buttonText}
        </Button>
    );
}
