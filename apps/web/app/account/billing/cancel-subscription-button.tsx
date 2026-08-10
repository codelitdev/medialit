"use client";

import { Button } from "@/components/ui/codelit/button";
import { useFormStatus } from "react-dom";
import { cancelSubscription } from "./action";
import { useEffect, useState, useActionState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/codelit/dialog";

export default function CancelSubscriptionButton({
    subscriptionStatus,
    currentPlan,
    className,
}: {
    subscriptionStatus: string;
    currentPlan: string;
    className?: string;
}) {
    const [formState, formAction] = useActionState(cancelSubscription, {
        success: false,
    });
    const router = useRouter();

    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (formState.success) {
            toast.success("We are sorry to see you go", {
                description: "Your subscription has been cancelled",
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
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    {currentPlan === "Basic" &&
                    subscriptionStatus === "subscribed" ? (
                        <Button className={className} variant="outline">
                            Downgrade to free
                        </Button>
                    ) : (
                        <Button className={className} variant="outline">
                            Cancel subscription
                        </Button>
                    )}
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    {currentPlan === "Basic" &&
                    subscriptionStatus === "subscribed" ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Downgrade to free</DialogTitle>
                            </DialogHeader>
                            Are you sure, you want to cancel your current
                            subscription?
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Cancel subscription</DialogTitle>
                            </DialogHeader>
                            Are you sure, you want to cancel subscription?
                        </>
                    )}

                    <form action={formAction}>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button>Nevermind</Button>
                            </DialogClose>
                            <DialogClose asChild>
                                <Submit
                                    currentPlan={currentPlan}
                                    subscriptionStatus={subscriptionStatus}
                                >
                                    Yes! Cancel
                                </Submit>
                            </DialogClose>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
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

    if (currentPlan === "Basic" && subscriptionStatus === "subscribed") {
        buttonText = "Yes! Cancel";
    }

    return (
        <Button type="submit" variant="destructive" disabled={status.pending}>
            {buttonText}
        </Button>
    );
}
