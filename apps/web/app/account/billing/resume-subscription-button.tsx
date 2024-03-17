"use client";

import { Button } from "@/components/ui/button";
import { useFormState, useFormStatus } from "react-dom";
import { resumeSubscription } from "./action";
import { useToast } from "@/components/ui/use-toast";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResumeSubscriptionButton({
    expiresAt,
    currentPlan,
    subscriptionStatus,
}: {
    expiresAt: Date;
    currentPlan: string;
    subscriptionStatus: string;
}) {
    const [formState, formAction] = useFormState(resumeSubscription, {
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
            >
                Resume subscription
            </Submit>

            <p className="text-center text-sm text-slate-500">
                Expires at{" "}
                {new Date(expiresAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                })}
            </p>
        </form>
    );
}

function Submit({
    children,
    currentPlan,
    subscriptionStatus,
}: {
    children: React.ReactNode;
    currentPlan: string;
    subscriptionStatus: string;
}) {
    const status = useFormStatus();
    let buttonText = children;
    let className;

    if (currentPlan === "Basic" && subscriptionStatus === "cancelled") {
        buttonText = "Downgrade to free";
        className = "bg-primary hover:bg-[#333333]";
    }

    return (
        <Button
            className={`bg-red-500 hover:bg-red-700 w-full text-white mb-2 ${className}`}
            type="submit"
            variant="secondary"
            disabled={status.pending}
        >
            {/* {children} */}
            {buttonText}
        </Button>
    );
}
