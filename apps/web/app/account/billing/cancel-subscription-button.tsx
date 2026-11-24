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
    videoStreamingApps,
    freeMinutes,
}: {
    className?: string;
    /** The account's apps with video streaming on. */
    videoStreamingApps: number;
    /** The free plan's video processing minutes a month. */
    freeMinutes: number;
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
                {videoStreamingApps > 0 ? (
                    <p className="m-0 rounded-lg bg-muted px-3 py-2.5 text-[13px] leading-normal text-muted-foreground">
                        {videoStreamingApps === 1
                            ? "1 app has"
                            : `${videoStreamingApps} apps have`}{" "}
                        video streaming on. After Pro ends,{" "}
                        {videoStreamingApps === 1 ? "it gets" : "they get"} the
                        free plan’s {freeMinutes}{" "}
                        {freeMinutes === 1 ? "minute" : "minutes"} of video
                        processing a month. Once those are used, new videos keep
                        only their original and poster until the next month.
                    </p>
                ) : null}
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
