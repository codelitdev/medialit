"use client";

import { Button } from "@/components/ui/button";
import { useFormState, useFormStatus } from "react-dom";
import { cancelSubscription } from "./action";
import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

export default function CancelSubscriptionButton({
    subscriptionStatus,
    currentPlan,
}: {
    subscriptionStatus: string;
    currentPlan: string;
}) {
    const [formState, formAction] = useFormState(cancelSubscription, {
        success: false,
    });
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        if (formState.success) {
            toast({
                title: "We are sorry to see you go",
                description: "Your subscription has been cancelled",
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
                Cancel subscription
            </Submit>
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

    if (currentPlan === "Basic" && subscriptionStatus === "subscribed") {
        buttonText = "Downgrade to free";
        className = "bg-primary hover:bg-[#333333]";
    }

    return (
        <Button
            className={`bg-red-500 hover:bg-red-700 w-full text-white ${className}`}
            type="submit"
            variant="secondary"
            disabled={status.pending}
        >
            {buttonText}
        </Button>
    );
}
