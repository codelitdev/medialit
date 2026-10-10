"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { resumeSubscription } from "./action";
import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function ResumeSubscriptionButton({
    paidThroughAt,
    className,
}: {
    /** When paid access ends, as returned by the API. */
    paidThroughAt: string | Date | null;
    className?: string;
}) {
    const [formState, formAction] = useActionState(resumeSubscription, {
        success: false,
    } as Awaited<ReturnType<typeof resumeSubscription>>);
    const router = useRouter();

    useEffect(() => {
        if (formState.success) {
            if (formState.url) {
                window.location.href = formState.url;
                return;
            }
            toast.success("Welcome back!", {
                description: "Your subscription has been resumed",
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
        <form action={formAction} className="w-full">
            <Submit className={className}>Resume subscription</Submit>
            {paidThroughAt && (
                <p
                    className="text-center text-sm text-slate-500"
                    suppressHydrationWarning={true}
                >
                    Cancelled. Pro stays active until{" "}
                    {new Date(paidThroughAt).toLocaleDateString(undefined, {
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
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const status = useFormStatus();
    return (
        <Button
            className={`w-full mb-1 ${className ?? ""}`}
            type="submit"
            variant="outline"
            disabled={status.pending}
        >
            {children}
        </Button>
    );
}
