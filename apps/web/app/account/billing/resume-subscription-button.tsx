"use client";

import { Button } from "@/components/ui/codelit/button";
import { cn } from "@/lib/utils";
import { useFormStatus } from "react-dom";
import { resumeSubscription } from "./action";
import { toast } from "sonner";
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
    const router = useRouter();

    useEffect(() => {
        if (formState.success) {
            toast.success("Welcome back!", {
                description: "Your subscription has been resumed",
            });
            router.refresh();
        }
        if (formState.error) {
            toast.error("Uh oh!", {
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
                        className="text-center text-sm text-muted-foreground"
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
    const isCurrentPlan =
        currentPlan === "Basic" && subscriptionStatus === "cancelled";

    if (isCurrentPlan) {
        buttonText = "Current plan";
    }

    return (
        <Button
            className={cn("mb-1 w-full", className)}
            type="submit"
            variant={isCurrentPlan ? "outline" : "primary"}
            disabled={status.pending || isCurrentPlan}
        >
            {buttonText}
        </Button>
    );
}
