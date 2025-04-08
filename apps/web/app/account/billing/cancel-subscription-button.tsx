"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { cancelSubscription } from "./action";
import { useEffect, useState, useActionState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";

export default function CancelSubscriptionButton({
    subscriptionStatus,
    currentPlan,
}: {
    subscriptionStatus: string;
    currentPlan: string;
}) {
    const [formState, formAction] = useActionState(cancelSubscription, {
        success: false,
    });
    const { toast } = useToast();
    const router = useRouter();

    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (formState.success) {
            setOpen(false);
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
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    {currentPlan === "Basic" &&
                    subscriptionStatus === "subscribed" ? (
                        <Button className="bg-primary hover:bg-[#333333]">
                            Downgrade to free
                        </Button>
                    ) : (
                        <Button className="bg-red-600 hover:bg-red-700">
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
    let className;

    if (currentPlan === "Basic" && subscriptionStatus === "subscribed") {
        buttonText = "Yes! Cancel";
        className = "bg-red-500 hover:bg-red-700";
    }

    return (
        <Button
            className={`bg-red-500 hover:bg-red-700 text-white ${className}`}
            type="submit"
            variant="secondary"
            disabled={status.pending}
        >
            {buttonText}
        </Button>
    );
}
