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
    className,
}: {
    className?: string;
}) {
    const [formState, formAction] = useActionState(cancelSubscription, {
        success: false,
    } as Awaited<ReturnType<typeof cancelSubscription>>);
    const { toast } = useToast();
    const router = useRouter();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (formState.success) {
            setOpen(false);
            toast({
                title: "We are sorry to see you go",
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
            toast({
                title: "Uh oh!",
                description: formState.error,
            });
        }
    }, [formState]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className={`bg-red-600 hover:bg-red-700 ${className}`}>
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
        <Button
            className="bg-red-500 hover:bg-red-700 text-white"
            type="submit"
            variant="secondary"
            disabled={status.pending}
        >
            {children}
        </Button>
    );
}
