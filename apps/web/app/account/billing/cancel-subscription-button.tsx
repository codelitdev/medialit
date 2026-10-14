"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { cancelSubscription } from "./action";
import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
    className,
}: {
    className?: string;
}) {
    const [formState, formAction] = useActionState(cancelSubscription, {
        success: false,
    } as Awaited<ReturnType<typeof cancelSubscription>>);
    const router = useRouter();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (formState.success) {
            setOpen(false);
            toast.success("We are sorry to see you go", {
                description:
                    "Your subscription is cancelled. Pro stays active until the end of the paid period.",
            });
            router.refresh();
        }
        if (formState.signInUrl) {
            window.location.assign(formState.signInUrl);
            return;
        }
        if (formState.error) {
            toast.error("Uh oh!", {
                description: formState.error,
            });
        }
    }, [formState]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive" className={className}>
                    Cancel subscription
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Cancel subscription</DialogTitle>
                    <DialogDescription>
                        Pro stays active until the end of the period you have
                        paid for. You can resume before then.
                    </DialogDescription>
                </DialogHeader>
                <form action={formAction}>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button>Nevermind</Button>
                        </DialogClose>
                        <DialogClose asChild>
                            <Submit>Yes! Cancel</Submit>
                        </DialogClose>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Submit({ children }: { children: React.ReactNode }) {
    const status = useFormStatus();
    return (
        <Button type="submit" variant="destructive" disabled={status.pending}>
            {children}
        </Button>
    );
}
